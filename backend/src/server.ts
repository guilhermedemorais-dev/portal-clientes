import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import pg from 'pg';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, type Config } from './config.js';
import { canReadProject, normalizeMetricMethod, pruneExpiringMap, OneTimeGrantStore, validateImage, type Principal } from './domain.js';
const { Pool } = pg;

type OAuthState = { verifier: string; browserChallenge: string; expiresAt: number };
type Session = { principal: Principal; expiresAt: number };
const grants = new OneTimeGrantStore();
const oauthStates = new Map<string, OAuthState>();
const sessions = new Map<string, Session>();
const hashToken = (s: string) => createHash('sha256').update(s).digest('hex');
const safeEqual = (a: string, b: string) => { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); };
const fingerprint = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const imageSignatureOk = (mime: string, b: Buffer) => mime === 'image/png' ? b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === 'image/jpeg' ? b[0]===255&&b[1]===216&&b[2]===255 : mime === 'image/gif' ? b.subarray(0,3).toString()==='GIF' : mime === 'image/webp' ? b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP' : false;

export async function buildApp(config: Config = loadConfig(), pool = new Pool({ connectionString: config.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 })) {
  const metrics = new Map<string, number>();
  const inc = (key: string) => metrics.set(key, (metrics.get(key) ?? 0) + 1);
  const add = (key: string, value: number) => metrics.set(key, (metrics.get(key) ?? 0) + value);
  const app: FastifyInstance = Fastify({
    logger: { level: config.LOG_LEVEL, redact: { paths: ['req.headers.authorization','req.headers.cookie','req.url'], censor: '[REDACTED]' } },
    requestIdHeader: 'x-request-id', genReqId: req => String(req.headers['x-request-id'] || randomBytes(12).toString('hex')),
    bodyLimit: config.MAX_UPLOAD_BYTES + 64 * 1024
  });
  app.decorate('db', pool);
  app.addHook('onRequest', async (req, reply) => { reply.header('x-request-id', req.id); });
  app.addHook('onResponse', async (req, reply) => { const labels=`method="${normalizeMetricMethod(req.method)}",status="${reply.statusCode}"`;inc(`portal_http_responses_total{${labels}}`);const secs=reply.elapsedTime/1000;add(`portal_http_request_duration_seconds_sum{${labels}}`,secs);inc(`portal_http_request_duration_seconds_count{${labels}}`);for(const bound of [0.01,0.05,0.1,0.25,0.5,1,2.5,5,10,Infinity])if(secs<=bound)inc(`portal_http_request_duration_seconds_bucket{le="${bound===Infinity?'+Inf':bound}",${labels}}`); });
  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, { origin: config.origins, methods: ['GET','POST','PATCH','DELETE','OPTIONS'], allowedHeaders: ['authorization','content-type','x-request-id'], exposedHeaders: ['x-request-id'], maxAge: 600 });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { files: 1, fileSize: config.MAX_UPLOAD_BYTES } });

  app.setErrorHandler(async (error,req,reply)=>{const code=(error as any).statusCode as number|undefined;if(code===413&&req.url.split('?')[0].endsWith('/uploads'))inc('portal_upload_events_total{result="rejected"}');const status=code&&code>=400&&code<=599?code:500;return reply.code(status).send({error:status===413?'request_too_large':'request_failed',requestId:req.id});});
  function principal(req: FastifyRequest): Principal | null {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    const key = hashToken(auth.slice(7)); const value = sessions.get(key);
    if (!value || value.expiresAt <= Date.now()) { sessions.delete(key); return null; }
    return value.principal;
  }
  async function requireProject(req: FastifyRequest, reply: any, projectId: string, ownerOnly=false): Promise<Principal | null> {
    const who = principal(req);
    if (!who) { inc('portal_acl_denials_total{reason="unauthenticated"}'); await reply.code(401).send({error:'unauthorized',requestId:req.id}); return null; }
    if (!canReadProject(who, projectId) || (ownerOnly && who.role !== 'owner')) { inc('portal_acl_denials_total{reason="forbidden"}'); await reply.code(403).send({ error: 'forbidden', requestId: req.id }); return null; }
    const active = await pool.query('SELECT m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.project_id=$2 AND u.revoked_at IS NULL',[who.userId,projectId]);
    if (!active.rowCount || active.rows[0].role !== who.role) { inc('portal_acl_denials_total{reason="revoked"}'); sessions.delete(hashToken(String(req.headers.authorization).slice(7))); await reply.code(403).send({error:'access_revoked',requestId:req.id}); return null; }
    return who;
  }
  async function audit(who: Principal, req: FastifyRequest, action: string, resource?: string) {
    await pool.query('INSERT INTO audit_events(actor_id,project_id,action,resource_id,request_id) VALUES($1,$2,$3,$4,$5)', [who.userId, who.projectId, action, resource ?? null, req.id]);
    inc(`portal_audit_events_total{action="${action}"}`);
  }
  app.get('/live', async () => ({ status: 'live' }));
  app.get('/ready', async (_req, reply) => { try { await pool.query('SELECT 1'); return { status:'ready', database:'ok' }; } catch { return reply.code(503).send({ status:'not_ready', database:'unavailable' }); } });
  app.get('/metrics', async (req, reply) => {
    if(!config.METRICS_BEARER_TOKEN)return reply.code(404).send({error:'not_found'});const auth=req.headers.authorization||'';if(!auth.startsWith('Bearer ')||!safeEqual(auth.slice(7),config.METRICS_BEARER_TOKEN))return reply.code(401).send({error:'unauthorized'});
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    const lines = ['# HELP portal_http_responses_total HTTP responses by method and status', '# TYPE portal_http_responses_total counter', '# HELP portal_http_request_duration_seconds Request processing duration', '# TYPE portal_http_request_duration_seconds histogram', '# HELP portal_audit_events_total Audit actions', '# TYPE portal_audit_events_total counter', '# HELP portal_upload_events_total Private upload operations', '# TYPE portal_upload_events_total counter', '# HELP portal_acl_denials_total Authorization denials', '# TYPE portal_acl_denials_total counter', '# HELP portal_auth_events_total Authentication outcomes', '# TYPE portal_auth_events_total counter', '# HELP portal_github_sync_total GitHub issue synchronization outcomes', '# TYPE portal_github_sync_total counter'];
    for (const [k,v] of metrics) lines.push(`${k} ${v}`);
    return lines.join('\n')+'\n';
  });
  app.get<{Querystring:{challenge?:string}}>('/v1/auth/github', async (req, reply) => {
    const browserChallenge=req.query.challenge||''; if(!/^[A-Za-z0-9_-]{43}$/.test(browserChallenge)){inc('portal_auth_events_total{result="oauth_failure"}');return reply.code(400).send({error:'pkce_challenge_required'});}
    if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET){inc('portal_auth_events_total{result="oauth_failure"}');return reply.code(503).send({error:'oauth_not_configured'});}
    pruneExpiringMap(oauthStates,Date.now(),1_000);const state=randomBytes(32).toString('base64url'), verifier=randomBytes(32).toString('base64url');
    const challenge=createHash('sha256').update(verifier).digest('base64url');
    oauthStates.set(state,{verifier,browserChallenge,expiresAt:Date.now()+300_000});
    const url=new URL('https://github.com/login/oauth/authorize'); url.searchParams.set('client_id',config.GITHUB_CLIENT_ID); url.searchParams.set('redirect_uri',new URL('/v1/auth/github/callback',config.API_PUBLIC_URL).toString()); url.searchParams.set('scope','read:user'); url.searchParams.set('state',state); url.searchParams.set('code_challenge',challenge); url.searchParams.set('code_challenge_method','S256');
    return reply.redirect(url.toString());
  });
  app.get<{Querystring:{code?:string;state?:string;error?:string}}>('/v1/auth/github/callback', async (req, reply) => {
    const {code,state}=req.query;
    if (!code || !state || req.query.error){inc('portal_auth_events_total{result="oauth_failure"}');return reply.code(400).send({error:'oauth_failed'});}
    const pending=oauthStates.get(state); oauthStates.delete(state);
    if (!pending || pending.expiresAt<Date.now() || !config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET){inc('portal_auth_events_total{result="oauth_failure"}');return reply.code(400).send({error:'invalid_oauth_state'});}
    try {
      const tokenRes=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:config.GITHUB_CLIENT_ID,client_secret:config.GITHUB_CLIENT_SECRET,code,redirect_uri:new URL('/v1/auth/github/callback',config.API_PUBLIC_URL).toString(),code_verifier:pending.verifier})});
      const tokenBody=await tokenRes.json() as {access_token?:string}; if (!tokenRes.ok || !tokenBody.access_token) throw new Error('oauth_token_exchange_failed');
      const userRes=await fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${tokenBody.access_token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
      if (!userRes.ok) throw new Error('oauth_profile_failed');
      const gh=await userRes.json() as {id:number;login:string;name?:string|null;avatar_url?:string};
      const role=config.accessMap[String(gh.id)]; if (!role){inc('portal_auth_events_total{result="oauth_failure"}');return reply.code(403).send({error:'not_authorized'});}
      const userId=`github:${gh.id}`;
      await pool.query(`INSERT INTO users(id,github_id,login,display_name,avatar_url) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(github_id) DO UPDATE SET login=EXCLUDED.login,display_name=EXCLUDED.display_name,avatar_url=EXCLUDED.avatar_url`,[userId,String(gh.id),gh.login,gh.name||gh.login,gh.avatar_url||null]);
      const status=await pool.query('SELECT revoked_at FROM users WHERE id=$1',[userId]);if(status.rows[0]?.revoked_at)return reply.code(403).send({error:'access_revoked'});
      await pool.query(`INSERT INTO memberships(user_id,project_id,role) VALUES($1,$2,$3) ON CONFLICT(user_id,project_id) DO NOTHING`,[userId,config.PROJECT_ID,role]);
      const grant=grants.issue({userId,projectId:config.PROJECT_ID,role,revoked:false},pending.browserChallenge);
      await pool.query('INSERT INTO audit_events(actor_id,project_id,action,resource_id,request_id) VALUES($1,$2,$3,$4,$5)',[userId,config.PROJECT_ID,'auth.login',null,req.id]);inc('portal_auth_events_total{result="login"}');
      return reply.header('referrer-policy','no-referrer').redirect(`${config.FRONTEND_CALLBACK_URL}?grant=${encodeURIComponent(grant)}`);
    } catch (err) { req.log.warn('OAuth provider exchange failed');inc('portal_auth_events_total{result="oauth_failure"}'); return reply.code(502).send({error:'oauth_provider_error'}); }
  });
  app.post<{Body:{grant?:string}}>('/v1/auth/exchange', async (req, reply) => {
    const token=typeof req.body?.grant==='string'?req.body.grant:'';
    const verifier=typeof (req.body as any)?.verifier==='string'?(req.body as any).verifier:'';
    const data=token?grants.consume(token,verifier):null;
    if (!data){inc('portal_auth_events_total{result="grant_failure"}');return reply.code(401).send({error:'invalid_or_expired_grant'});}
    const exists=await pool.query('SELECT 1 FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=$1 AND u.revoked_at IS NULL AND m.project_id=$2 AND m.role=$3',[data.userId,data.projectId,data.role]);
    if (!exists.rowCount){inc('portal_auth_events_total{result="grant_failure"}');return reply.code(403).send({error:'access_revoked'});}
    pruneExpiringMap(sessions,Date.now(),10_000);const bearer=randomBytes(32).toString('base64url'); sessions.set(hashToken(bearer),{principal:data,expiresAt:Date.now()+config.SESSION_TTL_SECONDS*1000});
    return {accessToken:bearer,tokenType:'Bearer',expiresIn:config.SESSION_TTL_SECONDS};
  });
  app.post('/v1/auth/logout',async(req,reply)=>{const auth=req.headers.authorization;if(auth?.startsWith('Bearer '))sessions.delete(hashToken(auth.slice(7)));return reply.code(204).send();});
  app.get('/v1/me', async (req,reply) => { const who=principal(req); if(!who)return reply.code(401).send({error:'unauthorized'}); const q=await pool.query('SELECT u.id,u.login,u.display_name AS "displayName",u.avatar_url AS "avatarUrl" FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=$1 AND u.revoked_at IS NULL AND m.project_id=$2 AND m.role=$3',[who.userId,who.projectId,who.role]); if(!q.rowCount)return reply.code(401).send({error:'unauthorized'}); return {user:q.rows[0],projectId:who.projectId,role:who.role}; });
  app.get<{Params:{projectId:string};Querystring:{cursor?:string;limit?:string}}>('/v1/projects/:projectId/feed', async (req,reply) => {
    const who=await requireProject(req,reply,req.params.projectId); if(!who)return;
    const limit=Math.min(100,Math.max(1,Number(req.query.limit)||30));
    const rows=await pool.query(`SELECT p.id,p.body,p.status,p.created_at AS "createdAt",p.module_title AS "moduleTitle",p.task_number AS "taskNumber",p.issue_url AS "issueUrl",p.attachment_ids AS "attachmentIds",json_build_object('id',u.id,'name',u.display_name,'avatarUrl',u.avatar_url,'role',m.role) AS author,
      COALESCE((SELECT json_agg(json_build_object('id',up.id,'mime',up.mime,'size',up.size_bytes,'description',up.description,'url',concat('/v1/projects/',p.project_id,'/uploads/',up.id)) ORDER BY up.created_at) FROM uploads up WHERE up.id=ANY(p.attachment_ids) AND up.project_id=p.project_id),'[]'::json) AS attachments,
      (SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) AS likes,
      EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$2) AS "likedByMe",
      EXISTS(SELECT 1 FROM attention_flags f WHERE f.post_id=p.id AND f.user_id=$2) AS "attentionByMe"
      FROM posts p JOIN users u ON u.id=p.author_id JOIN memberships m ON m.user_id=u.id AND m.project_id=p.project_id WHERE p.project_id=$1 AND (p.status='published' OR p.author_id=$2 OR $5='owner') AND ($3::timestamptz IS NULL OR p.created_at<$3) ORDER BY p.created_at DESC LIMIT $4`,[who.projectId,who.userId,req.query.cursor||null,limit,who.role]);
    return {items:rows.rows,nextCursor:rows.rows.length===limit?rows.rows.at(-1).createdAt:null};
  });
  app.post<{Params:{projectId:string};Body:{body:string}}>('/v1/projects/:projectId/posts', async(req,reply)=>{
    const who=await requireProject(req,reply,req.params.projectId);if(!who)return;
    const body=typeof req.body?.body==='string'?req.body.body.trim():''; if(!body||body.length>10000)return reply.code(400).send({error:'invalid_body'});
    const status=who.role==='owner'?'published':'pending';const q=await pool.query('INSERT INTO posts(project_id,author_id,body,status) VALUES($1,$2,$3,$4) RETURNING id,body,status,created_at AS "createdAt"',[who.projectId,who.userId,body,status]); await audit(who,req,'post.create',q.rows[0].id); return reply.code(201).send({post:q.rows[0]});
  });
  app.get<{Params:{projectId:string}}>('/v1/projects/:projectId/dashboard',async(req,reply)=>{
    const who=await requireProject(req,reply,req.params.projectId);if(!who)return;
    const result=await pool.query(`SELECT id,issue_number AS "issueNumber",issue_url AS "issueUrl",title,description,stage,status,progress,updated_at AS "updatedAt" FROM project_tasks WHERE project_id=$1 ORDER BY issue_number`,[who.projectId]);
    const all=result.rows;const eligible=all.filter((t:any)=>t.status!=='backlog');const done=eligible.filter((t:any)=>t.status==='done').length;const inProgress=eligible.filter((t:any)=>t.status==='in_progress').length;const blocked=eligible.filter((t:any)=>t.status==='blocked').length;
    const stages=[...new Set(all.map((t:any)=>t.stage))].map((id:string)=>({id,title:id,status:all.filter((t:any)=>t.stage===id).every((t:any)=>t.status==='done')?'done':all.some((t:any)=>t.stage===id&&t.status==='blocked')?'blocked':'in_progress',issueUrl:null}));
    const lastUpdated=all.map((t:any)=>t.updatedAt).sort((a:any,b:any)=>new Date(b).getTime()-new Date(a).getTime())[0]??null;
    return {projectId:who.projectId,stages,tasks:{done,inProgress,blocked,eligible:eligible.length},progress:{numerator:done,denominator:eligible.length,formula:'done / eligible * 100',source:'project_tasks.status'},lastUpdated,estimate:null};
  });
  app.post<{Params:{projectId:string};Body:{issueNumber:number;issueUrl:string;title:string;description?:string;stage:string;status:'backlog'|'in_progress'|'blocked'|'done';progress?:number}}>('/v1/projects/:projectId/tasks',async(req,reply)=>{
    const who=await requireProject(req,reply,req.params.projectId,true);if(!who)return;const b=req.body||{};
    const expected=`https://github.com/${config.GITHUB_REPOSITORY||'invalid/invalid'}/issues/${b.issueNumber}`;
    if(!Number.isInteger(b.issueNumber)||b.issueNumber<1||b.issueUrl!==expected||!b.title?.trim()||!b.stage?.trim()||!['backlog','in_progress','blocked','done'].includes(b.status)||!Number.isInteger(b.progress??0)||(b.progress??0)<0||(b.progress??0)>100)return reply.code(400).send({error:'invalid_task_or_issue_source'});
    const q=await pool.query(`INSERT INTO project_tasks(project_id,issue_number,issue_url,title,description,stage,status,progress) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(project_id,issue_number) DO UPDATE SET issue_url=EXCLUDED.issue_url,title=EXCLUDED.title,description=EXCLUDED.description,stage=EXCLUDED.stage,status=EXCLUDED.status,progress=EXCLUDED.progress,updated_at=now() RETURNING id,issue_number AS "issueNumber",issue_url AS "issueUrl",title,description,stage,status,progress,updated_at AS "updatedAt"`,[who.projectId,b.issueNumber,b.issueUrl,b.title.trim(),b.description||'',b.stage.trim(),b.status,b.progress??0]);await audit(who,req,'task.publish',String(q.rows[0].id));return reply.code(201).send({task:q.rows[0]});
  });
  app.post<{Params:{projectId:string;postId:string};Body:{body:string}}>('/v1/projects/:projectId/posts/:postId/comments',async(req,reply)=>{
    const who=await requireProject(req,reply,req.params.projectId);if(!who)return;const body=typeof req.body?.body==='string'?req.body.body.trim():'';if(!body||body.length>5000)return reply.code(400).send({error:'invalid_body'});
    const post=await pool.query('SELECT author_id,status FROM posts WHERE id=$1 AND project_id=$2',[req.params.postId,who.projectId]);if(!post.rowCount|| (post.rows[0].status!=='published'&&who.role!=='owner'&&post.rows[0].author_id!==who.userId))return reply.code(404).send({error:'not_found'});
    const q=await pool.query('INSERT INTO post_comments(post_id,author_id,body) VALUES($1,$2,$3) RETURNING id,body,created_at AS "createdAt"',[req.params.postId,who.userId,body]);await audit(who,req,'comment.create',q.rows[0].id);return reply.code(201).send({comment:{...q.rows[0],author:{id:who.userId}}});
  });
  app.get<{Params:{projectId:string;postId:string}}>('/v1/projects/:projectId/posts/:postId/comments',async(req,reply)=>{
    const who=await requireProject(req,reply,req.params.projectId);if(!who)return;const post=await pool.query('SELECT author_id,status FROM posts WHERE id=$1 AND project_id=$2',[req.params.postId,who.projectId]);if(!post.rowCount|| (post.rows[0].status!=='published'&&who.role!=='owner'&&post.rows[0].author_id!==who.userId))return reply.code(404).send({error:'not_found'});
    const q=await pool.query(`SELECT c.id,c.body,c.created_at AS "createdAt",json_build_object('id',u.id,'name',u.display_name,'avatarUrl',u.avatar_url) AS author FROM post_comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=$1 ORDER BY c.created_at`,[req.params.postId]);return {comments:q.rows};
  });
  app.patch<{Params:{projectId:string;postId:string};Body:{status:'published'|'rejected';moduleTitle?:string;taskNumber?:string;issueUrl?:string;attachmentIds?:string[]}}>('/v1/projects/:projectId/posts/:postId',async(req,reply)=>{
    const who=await requireProject(req,reply,req.params.projectId,true);if(!who)return;const b=req.body||{};if(!['published','rejected'].includes(b.status))return reply.code(400).send({error:'invalid_status'});
    if(b.attachmentIds && (!Array.isArray(b.attachmentIds)||b.attachmentIds.length>10||b.attachmentIds.some((id:string)=>typeof id!=='string')))return reply.code(400).send({error:'invalid_attachments'});
    if(b.attachmentIds?.length){const owned=await pool.query('SELECT count(*)::int AS n FROM uploads WHERE project_id=$1 AND id=ANY($2::uuid[])',[who.projectId,b.attachmentIds]);if(owned.rows[0].n!==b.attachmentIds.length)return reply.code(400).send({error:'invalid_attachments'});}
    if(b.issueUrl && !new RegExp(`^https://github\\.com/${(config.GITHUB_REPOSITORY||'').replace('/','/')}/issues/\\d+$`).test(b.issueUrl))return reply.code(400).send({error:'invalid_issue_url'});
    const q=await pool.query(`UPDATE posts SET status=$3,module_title=COALESCE($4,module_title),task_number=COALESCE($5,task_number),issue_url=COALESCE($6,issue_url),attachment_ids=COALESCE($7::uuid[],attachment_ids) WHERE id=$1 AND project_id=$2 RETURNING id,status`,[req.params.postId,who.projectId,b.status,b.moduleTitle||null,b.taskNumber||null,b.issueUrl||null,b.attachmentIds||null]);if(!q.rowCount)return reply.code(404).send({error:'not_found'});await audit(who,req,'post.review',req.params.postId);return {post:q.rows[0]};
  });

  for (const [verb,table,action] of [['like','post_likes','post.like'],['attention','attention_flags','post.attention']] as const) {
    app.post<{Params:{projectId:string;postId:string}}>('/v1/projects/:projectId/posts/:postId/'+verb,async(req,reply)=>{
      const who=await requireProject(req,reply,req.params.projectId);if(!who)return;
      const post=await pool.query('SELECT 1 FROM posts WHERE id=$1 AND project_id=$2',[req.params.postId,who.projectId]);if(!post.rowCount)return reply.code(404).send({error:'not_found'});
      await pool.query(`INSERT INTO ${table}(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[req.params.postId,who.userId]);await audit(who,req,action,req.params.postId);return {ok:true};
    });
    app.delete<{Params:{projectId:string;postId:string}}>('/v1/projects/:projectId/posts/:postId/'+verb,async(req,reply)=>{
      const who=await requireProject(req,reply,req.params.projectId);if(!who)return;
      await pool.query(`DELETE FROM ${table} WHERE post_id=$1 AND user_id=$2 AND EXISTS(SELECT 1 FROM posts WHERE id=$1 AND project_id=$3)`,[req.params.postId,who.userId,who.projectId]);return reply.code(204).send();
    });
  }
  app.post<{Params:{projectId:string};Querystring:{postId?:string;description?:string}}>('/v1/projects/:projectId/uploads',async(req,reply)=>{
    const who=await requireProject(req,reply,req.params.projectId);if(!who)return;
    const postId=req.query.postId;const description=(req.query.description||'').trim();if(!postId||description.length>1000){inc('portal_upload_events_total{result="rejected"}');return reply.code(400).send({error:'post_and_description_required'});}
    const post=await pool.query('SELECT author_id,status FROM posts WHERE id=$1 AND project_id=$2',[postId,who.projectId]);if(!post.rowCount||post.rows[0].status==='rejected'||(who.role==='client'&&post.rows[0].author_id!==who.userId)||(who.role==='client'&&post.rows[0].status!=='pending')){inc('portal_upload_events_total{result="rejected"}');return reply.code(404).send({error:'post_not_attachable'});}
    const part=await req.file();if(!part){inc('portal_upload_events_total{result="rejected"}');return reply.code(400).send({error:'file_required'});}
    const bytes=await part.toBuffer();const valid=validateImage({mime:part.mimetype,size:bytes.length,maxBytes:config.MAX_UPLOAD_BYTES});
    if(!valid.ok||!imageSignatureOk(part.mimetype,bytes)){inc('portal_upload_events_total{result="rejected"}');return reply.code(415).send({error:'invalid_image'});}
    await mkdir(config.STORAGE_DIR,{recursive:true,mode:0o700});const id=randomBytes(16).toString('hex');const key=`${id}.bin`;const full=path.join(config.STORAGE_DIR,key);await writeFile(full,bytes,{flag:'wx',mode:0o600});
    const client=await pool.connect();try {await client.query('BEGIN');await client.query('INSERT INTO uploads(id,project_id,owner_id,mime,size_bytes,sha256,description,storage_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,who.projectId,who.userId,part.mimetype,bytes.length,fingerprint(bytes),description,key]);await client.query('UPDATE posts SET attachment_ids=array_append(attachment_ids,$1::uuid) WHERE id=$2 AND project_id=$3',[id,postId,who.projectId]);await client.query('INSERT INTO audit_events(actor_id,project_id,action,resource_id,request_id) VALUES($1,$2,$3,$4,$5)',[who.userId,who.projectId,'upload.create',id,req.id]);await client.query('COMMIT');}catch(err){await client.query('ROLLBACK');await unlink(full).catch(()=>{});throw err;}finally{client.release();}
    inc('portal_upload_events_total{result="created"}');return reply.code(201).send({id,url:`/v1/projects/${who.projectId}/uploads/${id}`,mime:part.mimetype,size:bytes.length,description});
  });
  app.get<{Params:{projectId:string;uploadId:string}}>('/v1/projects/:projectId/uploads/:uploadId',async(req,reply)=>{
    const who=await requireProject(req,reply,req.params.projectId);if(!who)return;
    const q=await pool.query(`SELECT up.mime,up.storage_key FROM uploads up WHERE up.id=$1 AND up.project_id=$2 AND EXISTS(SELECT 1 FROM posts p WHERE up.id=ANY(p.attachment_ids) AND p.project_id=up.project_id AND (p.status='published' OR p.author_id=$3 OR $4='owner'))`,[req.params.uploadId,who.projectId,who.userId,who.role]);if(!q.rowCount)return reply.code(404).send({error:'not_found'});
    const file=await readFile(path.join(config.STORAGE_DIR,q.rows[0].storage_key));await audit(who,req,'upload.read',req.params.uploadId);return reply.type(q.rows[0].mime).header('cache-control','private, no-store').header('x-content-type-options','nosniff').send(file);
  });
  app.post<{Params:{projectId:string};Body:{issueNumber:number;commentId:number}}>('/v1/projects/:projectId/issues/sync',async(req,reply)=>{
    const who=await requireProject(req,reply,req.params.projectId,true);if(!who)return;
    const syncBody=req.body as Record<string,unknown>;if(!syncBody||Object.keys(syncBody).some(k=>!['issueNumber','commentId'].includes(k)))return reply.code(400).send({error:'invalid_issue_comment'});const {issueNumber,commentId}=syncBody as {issueNumber:number;commentId:number};if(!Number.isInteger(issueNumber)||issueNumber<1||!Number.isInteger(commentId)||commentId<1)return reply.code(400).send({error:'invalid_issue_comment'});
    if(!config.GITHUB_REPOSITORY||!config.GITHUB_TOKEN||!/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(config.GITHUB_REPOSITORY))return reply.code(503).send({error:'github_issue_source_not_configured'});
    const [owner,repo]=config.GITHUB_REPOSITORY.split('/');const repository=`${owner}/${repo}`;const originKey=`github:${repository}#issue:${issueNumber}/comment:${commentId}`;const headers={Authorization:`Bearer ${config.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    const commentResponse=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/comments/${commentId}`,{headers});
    const unpublish=async()=>{
      const client=await pool.connect();try{await client.query('BEGIN');const old=await client.query('SELECT id,status FROM posts WHERE project_id=$1 AND origin_key=$2 FOR UPDATE',[who.projectId,originKey]);if(!old.rowCount){await client.query('ROLLBACK');return null;}await client.query("UPDATE posts SET status='unpublished' WHERE id=$1 AND project_id=$2",[old.rows[0].id,who.projectId]);if(old.rows[0].status==='published')await client.query('INSERT INTO audit_events(actor_id,project_id,action,resource_id,request_id) VALUES($1,$2,$3,$4,$5)',[who.userId,who.projectId,'issue_comment.unpublish',old.rows[0].id,req.id]);await client.query('COMMIT');inc('portal_github_sync_total{result="unpublished"}');return old.rows[0].id;}catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
    };
    if(commentResponse.status===404){const postId=await unpublish();if(!postId)return reply.code(404).send({error:'issue_comment_not_found'});return {status:'unpublished',postId};}
    if(!commentResponse.ok)return reply.code(502).send({error:'github_comment_unavailable'});
    const comment=await commentResponse.json() as {id:number;body?:string|null;issue_url?:string};if(comment.id!==commentId||comment.issue_url!==`https://api.github.com/repos/${repository}/issues/${issueNumber}`)return reply.code(422).send({error:'issue_comment_binding_mismatch'});
    const issueResponse=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,{headers});if(issueResponse.status===404)return reply.code(404).send({error:'source_issue_not_found'});if(!issueResponse.ok)return reply.code(502).send({error:'github_issue_unavailable'});
    const issue=await issueResponse.json() as {number:number;title:string;html_url:string;pull_request?:unknown};if(issue.number!==issueNumber||issue.pull_request||issue.html_url!==`https://github.com/${repository}/issues/${issueNumber}`||!issue.title?.trim())return reply.code(422).send({error:'invalid_issue_source'});
    const approvalMarker='<!-- portal:client-approved -->';const rawBody=typeof comment.body==='string'?comment.body:'';const approved=rawBody.includes(approvalMarker);const body=rawBody.split(approvalMarker).join('').trim();
    if(!approved||!body){const postId=await unpublish();inc('portal_github_sync_total{result="unapproved"}');return {status:postId?'unpublished':'not_approved',...(postId?{postId}:{})};}
    const client=await pool.connect();try{await client.query('BEGIN');const existing=await client.query('SELECT id,status FROM posts WHERE project_id=$1 AND origin_key=$2 FOR UPDATE',[who.projectId,originKey]);const saved=await client.query(`INSERT INTO posts(project_id,author_id,body,status,module_title,task_number,issue_url,origin_key) VALUES($1,$2,$3,'published',$4,$5,$6,$7) ON CONFLICT(project_id,origin_key) WHERE origin_key IS NOT NULL DO UPDATE SET body=EXCLUDED.body,status='published',module_title=EXCLUDED.module_title,task_number=EXCLUDED.task_number,issue_url=EXCLUDED.issue_url RETURNING id,body,status,created_at AS "createdAt",module_title AS "moduleTitle",task_number AS "taskNumber",issue_url AS "issueUrl"`,[who.projectId,who.userId,body,issue.title,String(issue.number),issue.html_url,originKey]);const action=existing.rowCount&&existing.rows[0].status==='published'?'issue_comment.update':'issue_comment.publish';await client.query('INSERT INTO audit_events(actor_id,project_id,action,resource_id,request_id) VALUES($1,$2,$3,$4,$5)',[who.userId,who.projectId,action,saved.rows[0].id,req.id]);await client.query('COMMIT');inc(`portal_github_sync_total{result="${action==='issue_comment.update'?'updated':'published'}"}`);return reply.code(existing.rowCount?200:201).send({status:existing.rowCount?'updated':'published',post:saved.rows[0]});}catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
  });
  app.get<{Params:{projectId:string}}>('/v1/projects/:projectId/members',async(req,reply)=>{
    const who=await requireProject(req,reply,req.params.projectId,true);if(!who)return;
    const q=await pool.query(`SELECT u.id,u.login,u.display_name AS "displayName",m.role,u.revoked_at IS NOT NULL AS revoked FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.project_id=$1 ORDER BY u.login`,[who.projectId]);return {members:q.rows};
  });
  app.post<{Params:{projectId:string};Body:{githubId:string;role:'client'|'owner';login:string;displayName?:string}}>('/v1/projects/:projectId/members',async(req,reply)=>{
    const who=await requireProject(req,reply,req.params.projectId,true);if(!who)return;
    const {githubId,role,login,displayName}=req.body||{};if(!/^\d+$/.test(githubId||'')||!['client','owner'].includes(role)||!login)return reply.code(400).send({error:'invalid_member'});
    const id=`github:${githubId}`;const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[who.projectId]);const existing=await client.query("SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2",[who.projectId,id]);if(existing.rowCount&&existing.rows[0].role==='owner'&&role!=='owner'){const n=await client.query("SELECT count(*)::int AS n FROM memberships WHERE project_id=$1 AND role='owner'",[who.projectId]);if(n.rows[0].n<=1){await client.query('ROLLBACK');return reply.code(409).send({error:'cannot_remove_last_owner'});}}await client.query(`INSERT INTO users(id,github_id,login,display_name) VALUES($1,$2,$3,$4) ON CONFLICT(github_id) DO UPDATE SET login=EXCLUDED.login,display_name=EXCLUDED.display_name,revoked_at=NULL`,[id,githubId,login,displayName||login]);await client.query(`INSERT INTO memberships(user_id,project_id,role) VALUES($1,$2,$3) ON CONFLICT(user_id,project_id) DO UPDATE SET role=EXCLUDED.role`,[id,who.projectId,role]);await client.query('INSERT INTO audit_events(actor_id,project_id,action,resource_id,request_id) VALUES($1,$2,$3,$4,$5)',[who.userId,who.projectId,'member.grant',id,req.id]);await client.query('COMMIT');}catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}return reply.code(201).send({id,role});
  });
  app.delete<{Params:{projectId:string;userId:string}}>('/v1/projects/:projectId/members/:userId',async(req,reply)=>{
    const who=await requireProject(req,reply,req.params.projectId,true);if(!who)return;if(req.params.userId===who.userId)return reply.code(409).send({error:'cannot_revoke_self'});
    const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[who.projectId]);const target=await client.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2',[who.projectId,req.params.userId]);if(target.rows[0]?.role==='owner'){const n=await client.query("SELECT count(*)::int AS n FROM memberships WHERE project_id=$1 AND role='owner'",[who.projectId]);if(n.rows[0].n<=1){await client.query('ROLLBACK');return reply.code(409).send({error:'cannot_remove_last_owner'});}}await client.query('DELETE FROM memberships WHERE project_id=$1 AND user_id=$2',[who.projectId,req.params.userId]);await client.query('UPDATE users SET revoked_at=now() WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=$1)',[req.params.userId]);await client.query('INSERT INTO audit_events(actor_id,project_id,action,resource_id,request_id) VALUES($1,$2,$3,$4,$5)',[who.userId,who.projectId,'member.revoke',req.params.userId,req.id]);await client.query('COMMIT');}catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}return reply.code(204).send();
  });
  app.addHook('onClose',async()=>{await pool.end();});
  return app;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const config=loadConfig();const app=await buildApp(config);await app.listen({port:config.PORT,host:config.HOST});
}
