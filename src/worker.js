import { graphql, buildSchema } from 'graphql';
import { typeDefs, makeRootValue } from './schema.js';

// Built lazily on first use: workerd disallows building the schema (parsing,
// which touches randomness/timing internals) at module top-level scope.
let schema;
function getSchema() {
  if (!schema) schema = buildSchema(typeDefs);
  return schema;
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // GET/HEAD on /graphql serves the explorer page (public/graphql/index.html)
    // as a plain static asset; only POST is routed into the GraphQL executor.
    if (url.pathname === '/graphql' && request.method !== 'GET' && request.method !== 'HEAD') {
      return handleGraphQL(request);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleGraphQL(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ errors: [{ message: 'Only POST is supported' }] }, 405);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ errors: [{ message: 'Expected an application/json body' }] }, 415);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ errors: [{ message: `Invalid JSON body: ${err.message}` }] }, 400);
  }

  const { query, variables, operationName } = body ?? {};
  if (!query) {
    return jsonResponse({ errors: [{ message: 'Missing "query"' }] }, 400);
  }

  const result = await graphql({
    schema: getSchema(),
    source: query,
    rootValue: makeRootValue(),
    variableValues: variables,
    operationName,
  });

  return jsonResponse(result, 200);
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}
