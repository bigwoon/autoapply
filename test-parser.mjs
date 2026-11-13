import { parseResumeText } from './resume-parser.mjs';

const sampleResume = `
Jane Smith
San Francisco, CA | (555) 234-5678 | jane.smith.dev@gmail.com
linkedin.com/in/janesmith-dev | github.com/janesmith | https://janesmith.dev

Professional Summary:
Full-Stack Software Engineer with 4+ years of experience designing scalable microservices, REST APIs, and modern React web applications. Passionate about automated testing and system reliability.

Experience:
Senior Frontend Developer - Stripe (2022 - Present)
- Designed and maintained high-volume payment checkout dashboards using React and TypeScript.
- Reduced initial bundle load times by 35% through code-splitting and dynamic imports.

Software Engineer - Coinbase (2020 - 2022)
- Implemented real-time WebSocket feeds for crypto pricing data.
- Built internal tooling in Node.js and PostgreSQL.

Education:
B.S. in Computer Science - UC Berkeley (2016 - 2020)
`;

console.log('=== INPUT RESUME TEXT ===');
console.log(sampleResume.trim());

console.log('\n=== PARSER EXTRACTION OUTPUT ===');
const extracted = parseResumeText(sampleResume);
console.log(JSON.stringify(extracted, null, 2));
