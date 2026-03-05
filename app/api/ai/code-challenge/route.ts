import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { nextGroqKey } from '@/lib/groqKeys'

const GEMINI_KEYS = (process.env.NEXT_PUBLIC_GEMINI_API_KEYS ?? '')
  .split(',').map(k => k.trim()).filter(Boolean)
let _keyIdx = 0
function nextGeminiKey() {
  if (GEMINI_KEYS.length === 0) return undefined
  const k = GEMINI_KEYS[_keyIdx % GEMINI_KEYS.length]
  _keyIdx++
  return k
}

export const maxDuration = 30

// ── Language map ───────────────────────────────────────────────────────────
const SKILL_LANGUAGE_MAP: Record<string, string> = {
  javascript: 'javascript', js: 'javascript', typescript: 'typescript', ts: 'typescript',
  react: 'javascript', vue: 'javascript', angular: 'javascript', node: 'javascript', nodejs: 'javascript',
  python: 'python', django: 'python', flask: 'python', fastapi: 'python', ml: 'python', 'machine learning': 'python', ai: 'python',
  java: 'java', spring: 'java', android: 'java',
  kotlin: 'kotlin',
  swift: 'swift', ios: 'swift',
  c: 'c', cpp: 'cpp', 'c++': 'cpp', 'c#': 'csharp', csharp: 'csharp', dotnet: 'csharp',
  php: 'php', laravel: 'php', wordpress: 'php',
  ruby: 'ruby', rails: 'ruby',
  go: 'go', golang: 'go',
  rust: 'rust',
  sql: 'sql', mysql: 'sql', postgresql: 'sql', postgres: 'sql', database: 'sql',
  html: 'html', css: 'css', web: 'javascript',
  bash: 'shell', shell: 'shell', linux: 'shell',
}

export function inferLanguage(skill: string): string {
  const s = skill.toLowerCase().replace(/[-_\s]/g, '')
  for (const [key, lang] of Object.entries(SKILL_LANGUAGE_MAP)) {
    if (s.includes(key.replace(/[-_\s]/g, ''))) return lang
  }
  // Non-programming skills → use Python as a clear, readable pseudocode-like language
  return 'python'
}

// ── Starter code templates ─────────────────────────────────────────────────
const STARTERS: Record<string, (fnName: string, params: string) => string> = {
  python:     (fn, p) => `def ${fn}(${p}):\n    # Write your solution here\n    pass\n`,
  javascript: (fn, p) => `function ${fn}(${p}) {\n  // Write your solution here\n}\n`,
  typescript: (fn, p) => `function ${fn}(${p}): any {\n  // Write your solution here\n}\n`,
  java:       (fn, p) => `public class Solution {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n`,
  cpp:        (fn, p) => `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`,
  c:          (fn, p) => `#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`,
  csharp:     (fn, p) => `using System;\nclass Solution {\n    static void Main() {\n        // Write your solution here\n    }\n}\n`,
  php:        (fn, p) => `<?php\nfunction ${fn}(${p}) {\n    // Write your solution here\n}\n?>`,
  ruby:       (fn, p) => `def ${fn}(${p})\n  # Write your solution here\nend\n`,
  go:         (fn, p) => `package main\nimport "fmt"\n\nfunc main() {\n    // Write your solution here\n    fmt.Println()\n}\n`,
  rust:       (fn, p) => `fn main() {\n    // Write your solution here\n}\n`,
  sql:        (_fn, _p) => `-- Write your SQL query here\nSELECT \n`,
  html:       (_fn, _p) => `<!DOCTYPE html>\n<html>\n<body>\n  <!-- Write your HTML here -->\n</body>\n</html>\n`,
  shell:      (_fn, _p) => `#!/bin/bash\n# Write your script here\n`,
  kotlin:     (fn, p) => `fun main() {\n    // Write your solution here\n}\n`,
  swift:      (fn, p) => `import Foundation\n\nfunc ${fn}(${p}) {\n    // Write your solution here\n}\n`,
}

// ── AI call with Groq → Gemini fallback ───────────────────────────────────
async function callAI(prompt: string): Promise<string> {
  const groqKey = await nextGroqKey()
  if (groqKey) {
    try {
      const groq = createOpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: groqKey })
      const { text } = await generateText({ model: groq('llama-3.1-8b-instant'), prompt, maxTokens: 600 })
      return text
    } catch { /* fall through */ }
  }
  const geminiKey = nextGeminiKey()
  if (geminiKey) {
    try {
      const google = createGoogleGenerativeAI({ apiKey: geminiKey })
      const { text } = await generateText({ model: google('gemini-2.0-flash'), prompt, maxTokens: 600 })
      return text
    } catch { /* fall through */ }
  }
  throw new Error('No AI provider available')
}

// ── POST handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { skill, action, code, question } = await req.json()

  if (action === 'generate') {
    const language = inferLanguage(skill)
    const prompt = `You are a coding challenge generator for a skill-verification platform.

Skill being tested: "${skill}"
Programming language: ${language}

Generate ONE simple, 60-second coding challenge that tests basic ${skill} knowledge.

STRICT RULES:
1. The question MUST be solvable in under 60 seconds by anyone with basic ${skill} skills
2. It must require writing actual code (not an explanation)
3. Keep it very simple — a beginner-to-intermediate task
4. Provide minimal starter code with the function signature filled in
5. Give ONE clear example input and the expected output

Good question types:
- "Write a function that returns X given Y"
- "Complete this function that does Z"
- "Fix the bug in this code so that it does X"
- "Write a short script that prints X"

Return ONLY valid JSON (no markdown, no code fences):
{
  "question": "One clear, simple task description in plain English (max 2 sentences)",
  "starterCode": "Complete starter code in ${language} with function signature and a comment where to write the solution",
  "exampleInput": "example input value or description",
  "exampleOutput": "expected output for that input",
  "functionName": "camelCase function or method name",
  "params": "param1, param2"
}`

    try {
      const raw = await callAI(prompt)
      const json = JSON.parse(raw.replace(/^```[a-z]*\n?|\n?```$/g, '').trim())
      const getter = STARTERS[language] ?? STARTERS.python
      const starterCode = json.starterCode || getter(json.functionName ?? 'solution', json.params ?? 'n')
      return NextResponse.json({
        question: json.question,
        starterCode,
        exampleInput: json.exampleInput,
        exampleOutput: json.exampleOutput,
        language,
      })
    } catch (e) {
      // Fallback hardcoded challenge when AI fails
      const language2 = inferLanguage(skill)
      const getter2 = STARTERS[language2] ?? STARTERS.python
      return NextResponse.json({
        question: `Write a function that takes a number n and returns the sum of all numbers from 1 to n.`,
        starterCode: getter2('sumTo', 'n'),
        exampleInput: '5',
        exampleOutput: '15',
        language: language2,
      })
    }
  }

  if (action === 'evaluate') {
    const language = inferLanguage(skill)
    const prompt = `You are evaluating a coding challenge submission.

Skill: "${skill}"
Language: ${language}
Challenge: "${question}"
Submitted code:
\`\`\`${language}
${code}
\`\`\`

Evaluate whether this code correctly solves the challenge. Be lenient — if the logic is mostly right, mark it as passed.

Return ONLY valid JSON (no markdown):
{
  "passed": true or false,
  "score": number from 0 to 100,
  "feedback": "One sentence of constructive feedback (max 20 words)"
}`

    try {
      const raw = await callAI(prompt)
      const json = JSON.parse(raw.replace(/^```[a-z]*\n?|\n?```$/g, '').trim())
      return NextResponse.json({ passed: json.passed, score: json.score ?? 0, feedback: json.feedback ?? '' })
    } catch {
      return NextResponse.json({ passed: false, score: 0, feedback: 'Could not evaluate — please try again.' })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
