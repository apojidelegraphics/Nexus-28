#!/usr/bin/env node
// Tiny real MCP server (stdio) for tests: one read tool, one write tool.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const server = new McpServer({ name: 'nexus-test', version: '1.0.0' });
server.registerTool('list_notes', { description: 'List notes', inputSchema: { tag: z.string().optional() }, annotations: { readOnlyHint: true } },
  async ({ tag }) => ({ content: [{ type: 'text', text: `notes for ${tag || 'all'}: alpha, beta (token=${process.env.TEST_TOKEN || 'none'})` }] }));
server.registerTool('send_note', { description: 'Send a note', inputSchema: { to: z.string(), body: z.string() } },
  async ({ to, body }) => ({ content: [{ type: 'text', text: `sent "${body}" to ${to}` }] }));
server.registerTool('explode', { description: 'Always fails', inputSchema: {}, annotations: { readOnlyHint: true } },
  async () => ({ isError: true, content: [{ type: 'text', text: 'kaboom' }] }));
server.connect(new StdioServerTransport());
