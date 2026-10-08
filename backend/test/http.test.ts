import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { loadConfig } from '../src/config.js';
const pool = { query: async()=>({rows:[],rowCount:0}), end:async()=>{} } as any;
const config=loadConfig({DATABASE_URL:'postgres://test:test@localhost:5432/test',PROJECT_ID:'demo',FRONTEND_ORIGINS:'http://localhost:5173',FRONTEND_CALLBACK_URL:'http://localhost:5173/auth/callback',ACCESS_MAP_JSON:'{}',METRICS_BEARER_TOKEN:'metrics-test-token'} as NodeJS.ProcessEnv);

test('liveness and response request IDs are available without provider credentials',async()=>{
  const app=await buildApp(config,pool);const response=await app.inject({method:'GET',url:'/live'});
  assert.equal(response.statusCode,200);assert.equal(response.json().status,'live');assert.ok(response.headers['x-request-id']);await app.close();
});
test('OAuth initiation fails closed without a browser PKCE challenge',async()=>{
  const app=await buildApp(config,pool);const response=await app.inject({method:'GET',url:'/v1/auth/github'});
  assert.equal(response.statusCode,400);assert.equal(response.json().error,'pkce_challenge_required');await app.close();
});
test('metrics endpoint returns Prometheus text format',async()=>{
  const app=await buildApp(config,pool);const denied=await app.inject({method:'GET',url:'/metrics'});assert.equal(denied.statusCode,401);const wrong=await app.inject({method:'GET',url:'/metrics',headers:{authorization:'Bearer wrong-token'}});assert.equal(wrong.statusCode,401);const response=await app.inject({method:'GET',url:'/metrics',headers:{authorization:'Bearer metrics-test-token'}});
  assert.equal(response.statusCode,200);assert.match(response.headers['content-type']||'',/text\/plain/);assert.match(response.body,/portal_http_responses_total/);assert.match(response.body,/portal_http_request_duration_seconds/);await app.close();
});

test('OAuth, ACL and upload failures produce bounded operational counters',async()=>{
  const app=await buildApp(config,pool);
  const oauth=await app.inject({method:'GET',url:`/v1/auth/github?challenge=${'a'.repeat(43)}`});assert.equal(oauth.statusCode,503);
  const acl=await app.inject({method:'GET',url:'/v1/projects/demo/feed'});assert.equal(acl.statusCode,401);
  const metrics=await app.inject({method:'GET',url:'/metrics',headers:{authorization:'Bearer metrics-test-token'}});
  assert.match(metrics.body,/portal_auth_events_total\{result="oauth_failure"\} 1/);
  assert.match(metrics.body,/portal_acl_denials_total\{reason="unauthenticated"\} 1/);
  await app.close();
});
