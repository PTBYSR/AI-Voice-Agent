const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJiZmE3NjkwZC1iMTE3LTRhMzMtOWJjZi0yYzdlYWQzMmE5MzYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNWYyNGUxMDAtYTFmNy00ZDc3LWIxODYtZWMxZTA3OGQyMjE1IiwiaWF0IjoxNzc1NjY5ODk4fQ.Zf-OiyES3n2diNJxJ-zYrEbNsC2Lq-FPfGBUo9T1Zew';
const WORKFLOW_ID = 'fmQIfUvWvEFB6wNm';
const BASE = 'cohort2pod1.app.n8n.cloud';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: BASE,
      path,
      method,
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch (e) { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── System prompts ──────────────────────────────────────────────────────────

const CLASSIFY_SYSTEM = [
  'You are an intent classifier for RelayPay customer support.',
  'Analyze the customer\'s question and respond with ONLY a valid JSON object, no other text:',
  '',
  '{',
  '  "intent": "direct_answer" | "clarify" | "escalate",',
  '  "category": "onboarding" | "pricing" | "payouts" | "transactions" | "invoicing" | "compliance" | "general",',
  '  "clarification_question": "only include this field if intent is clarify",',
  '  "escalation_reason": "only include this field if intent is escalate"',
  '}',
  '',
  'Classification rules:',
  'DIRECT_ANSWER — clear specific questions about general product features, pricing, timelines, processes, policies.',
  'CLARIFY — ambiguous or missing critical details. Always provide clarification_question.',
  'ESCALATE — specific transaction/account queries, complaints, disputes, refunds, fraud, security concerns.'
].join('\n');

const GENERATE_SYSTEM = [
  'You are a customer support agent for RelayPay, a B2B cross-border payments platform for African startups and SMEs.',
  '',
  'Generate a helpful, accurate spoken response to the customer\'s question using ONLY the context provided below.',
  '',
  'STRICT RULES:',
  '1. ONLY use information from the provided context. Do not add any information from your own knowledge.',
  '2. If the context doesn\'t fully answer the question, say: "Based on what I have, [partial answer]. For more details, I\'d recommend reaching out to our support team at support@relaypay.co."',
  '3. Keep your response to 2-4 sentences maximum. This will be spoken aloud in a voice call.',
  '4. Use simple, clear language. No bullet points, no markdown, no formatting.',
  '5. Be warm and professional.',
  '6. End with: "Is there anything else I can help with?"'
].join('\n');

// ── Downstream code that parses OpenAI response ──────────────────────────────
// @n8n/n8n-nodes-langchain.openAi outputs full OpenAI API response:
// choices[0].message.content

const PARSE_INTENT_CODE = [
  'const input = $input.first().json;',
  'const upstream = $(\'Extract & Validate Input\').first().json;',
  '',
  'let classification;',
  'try {',
  '  const text = input.choices?.[0]?.message?.content || \'{}\';',
  '  classification = typeof text === \'string\' ? JSON.parse(text) : text;',
  '} catch(e) {',
  '  classification = { intent: \'escalate\', category: \'general\', escalation_reason: \'Failed to classify intent\' };',
  '}',
  '',
  'return [{',
  '  json: {',
  '    ...upstream,',
  '    intent: classification.intent || \'escalate\',',
  '    category: classification.category || \'general\',',
  '    clarification_question: classification.clarification_question || \'\',',
  '    escalation_reason: classification.escalation_reason || \'\'',
  '  }',
  '}];'
].join('\n');

const FORMAT_ANSWER_CODE = [
  'const input = $input.first().json;',
  'const upstream = $(\'Extract & Validate Input\').first().json;',
  'const answerText = input.choices?.[0]?.message?.content',
  '  || \'I was unable to generate an answer. Please contact support@relaypay.co.\';',
  'return [{',
  '  json: {',
  '    toolCallId: upstream.toolCallId,',
  '    response: answerText',
  '  }',
  '}];'
].join('\n');

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching workflow...');
  const { status: getStatus, body: wf } = await request('GET', `/api/v1/workflows/${WORKFLOW_ID}`);
  if (getStatus !== 200) {
    console.error('GET failed:', getStatus, JSON.stringify(wf));
    process.exit(1);
  }
  console.log(`Got workflow: "${wf.name}" (active: ${wf.active}, nodes: ${wf.nodes.length})`);

  // ── Replace node-classify → @n8n/n8n-nodes-langchain.openAi ────────────
  const classifyIdx = wf.nodes.findIndex(n => n.id === 'node-classify');
  if (classifyIdx === -1) { console.error('node-classify not found'); process.exit(1); }

  wf.nodes[classifyIdx] = {
    id: 'node-classify',
    name: 'Classify Intent',
    type: '@n8n/n8n-nodes-langchain.openAi',
    typeVersion: 1.8,
    position: wf.nodes[classifyIdx].position,
    parameters: {
      modelId: {
        __rl: true,
        mode: 'id',
        value: 'gpt-4o-mini'
      },
      messages: {
        values: [
          {
            role: 'system',
            content: CLASSIFY_SYSTEM
          },
          {
            role: 'user',
            content: '={{ $json.userQuery }}'
          }
        ]
      },
      options: {
        temperature: 0,
        maxTokens: 300,
        response_format: { type: 'json_object' }
      }
    },
    credentials: {
      openAiApi: { id: '', name: 'OpenAI API' }
    }
  };
  console.log('Replaced node-classify → @n8n/n8n-nodes-langchain.openAi (gpt-4o-mini, JSON mode)');

  // ── Replace node-generate-answer → @n8n/n8n-nodes-langchain.openAi ─────
  const genIdx = wf.nodes.findIndex(n => n.id === 'node-generate-answer');
  if (genIdx === -1) { console.error('node-generate-answer not found'); process.exit(1); }

  wf.nodes[genIdx] = {
    id: 'node-generate-answer',
    name: 'Generate Answer',
    type: '@n8n/n8n-nodes-langchain.openAi',
    typeVersion: 1.8,
    position: wf.nodes[genIdx].position,
    parameters: {
      modelId: {
        __rl: true,
        mode: 'id',
        value: 'gpt-4o'
      },
      messages: {
        values: [
          {
            role: 'system',
            content: GENERATE_SYSTEM
          },
          {
            role: 'user',
            content: [
              '=CONTEXT FROM KNOWLEDGE BASE:',
              "{{ $json.matches?.map(m => m.metadata?.text || '').join('\\n\\n') || 'No context available' }}",
              '',
              'CUSTOMER QUESTION:',
              "{{ $('Extract & Validate Input').first().json.userQuery }}"
            ].join('\n')
          }
        ]
      },
      options: {
        temperature: 0.1,
        maxTokens: 300
      }
    },
    credentials: {
      openAiApi: { id: '', name: 'OpenAI API' }
    }
  };
  console.log('Replaced node-generate-answer → @n8n/n8n-nodes-langchain.openAi (gpt-4o)');

  // ── Update downstream code nodes ─────────────────────────────────────────
  const parseIdx = wf.nodes.findIndex(n => n.id === 'node-parse-intent');
  if (parseIdx !== -1) {
    wf.nodes[parseIdx].parameters.jsCode = PARSE_INTENT_CODE;
    console.log('Updated node-parse-intent → reads choices[0].message.content');
  }

  const fmtIdx = wf.nodes.findIndex(n => n.id === 'node-format-answer');
  if (fmtIdx !== -1) {
    wf.nodes[fmtIdx].parameters.jsCode = FORMAT_ANSWER_CODE;
    console.log('Updated node-format-answer → reads choices[0].message.content');
  }

  // ── Deactivate, PUT, report ───────────────────────────────────────────────
  const isActive = wf.active;
  if (isActive) {
    console.log('\nDeactivating workflow...');
    const { status: ds } = await request('POST', `/api/v1/workflows/${WORKFLOW_ID}/deactivate`, {});
    console.log(ds === 200 ? 'Deactivated.' : `Deactivate returned ${ds} — continuing`);
  }

  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: {
      executionOrder: wf.settings?.executionOrder || 'v1',
      saveManualExecutions: wf.settings?.saveManualExecutions ?? true,
      callerPolicy: wf.settings?.callerPolicy || 'workflowsFromSameOwner'
    },
    staticData: null
  };

  console.log('PUTting updated workflow...');
  const { status: putStatus, body: putBody } = await request('PUT', `/api/v1/workflows/${WORKFLOW_ID}`, payload);

  if (putStatus === 200) {
    console.log('\nSUCCESS — workflow updated.');
    console.log('Nodes changed:');
    console.log('  • Classify Intent  → @n8n/n8n-nodes-langchain.openAi  (gpt-4o-mini, JSON mode)');
    console.log('  • Generate Answer  → @n8n/n8n-nodes-langchain.openAi  (gpt-4o)');
    console.log('  • Parse Intent     → reads choices[0].message.content');
    console.log('  • Format Answer    → reads choices[0].message.content');
    console.log('\nNEXT STEP: Open n8n, connect your "OpenAI API" credential to both nodes, then reactivate.');
  } else {
    console.error('PUT failed:', putStatus);
    console.error(JSON.stringify(putBody, null, 2));
  }
}

main().catch(console.error);
