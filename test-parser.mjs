import { parseResumeText } from './resume-parser.mjs';

// ====================================================================
// TEST 1: Standard single-column tech resume (most common format)
// ====================================================================
const resume1 = `
ALEX RIVERA
San Francisco, CA | (555) 019-2834 | alex.rivera@email.com | linkedin.com/in/alexrivera | github.com/arivera

PROFESSIONAL SUMMARY
Results-driven Software Engineer with 4+ years of experience designing, building, and scaling high-performance backend services and distributed web applications. Strong background in Python, Go, and TypeScript, with a proven track record of optimizing cloud infrastructure, reducing system latency, and delivering reliable features in fast-paced agile environments.

TECHNICAL SKILLS
- Languages: Python, Go, TypeScript, JavaScript, SQL (PostgreSQL), HTML/CSS
- Frameworks & Libraries: Node.js, Express, React, FastAPI, Django
- Cloud & DevOps: AWS (EC2, S3, Lambda, RDS), Docker, Kubernetes, CI/CD (GitHub Actions, Jenkins), Terraform
- Tools & Databases: Redis, PostgreSQL, MongoDB, Git, Kafka, Datadog

WORK EXPERIENCE

Software Engineer II
Nexus Cloud Technologies — San Francisco, CA
June 2023 – Present
- Architected and deployed a microservices-based notification pipeline using Go and AWS Lambda, processing over 4M daily user events with 99.99% uptime.
- Optimized PostgreSQL query execution paths and implemented Redis caching layers, reducing database read latency by 38% across core API endpoints.

Software Engineer
DataFlow Systems — Austin, TX
July 2021 – May 2023
- Developed and maintained RESTful APIs using Python (FastAPI) and Docker to handle large-scale data ingestion from third-party enterprise clients.
- Automated CI/CD deployment pipelines using GitHub Actions, cutting release deployment times from 45 minutes to under 10 minutes.

EDUCATION

Bachelor of Science in Computer Science
University of Texas at Austin — Austin, TX
Graduated: May 2021
`;

// ====================================================================
// TEST 2: Minimal / junior dev resume (sparse formatting)
// ====================================================================
const resume2 = `
Marcus Johnson
Brooklyn, NY
marcus.j.dev@outlook.com
+1-347-555-9012
https://www.linkedin.com/in/marcusjdev
https://github.com/mjohnsondev
https://marcusjohnson.io

About Me:
Recent CS graduate passionate about full-stack web development. Experienced with JavaScript, React, and Python through internships and personal projects.

Experience:

Software Engineering Intern - Shopify (Summer 2024)
- Built React components for merchant analytics dashboard
- Wrote unit tests with Jest achieving 90% coverage

Education:
B.A. Computer Science - NYU (2020-2024)
GPA: 3.7
`;

// ====================================================================
// TEST 3: Senior engineer / multi-role resume (dense, lots of data)
// ====================================================================
const resume3 = `
Dr. Priya Krishnamurthy
Staff Software Engineer
Seattle, WA 98101 | priya.k@protonmail.com | 206.555.7788
linkedin.com/in/priyak | github.com/priyakdev | https://priyak.engineering

Summary:
Seasoned software engineer with 12 years of experience across distributed systems, cloud-native architecture, and engineering leadership. Previously at Amazon, Google, and two YC-backed startups. Expert in Java, Go, Python, and Kubernetes. Led teams of up to 15 engineers. Ph.D. in Computer Science from Carnegie Mellon University.

Technical Skills:
Languages: Java, Go, Python, C++, Rust, TypeScript
Infrastructure: Kubernetes, Docker, Terraform, AWS, GCP, Azure
Data: PostgreSQL, DynamoDB, Kafka, Spark, Redis, BigQuery
ML/AI: PyTorch, TensorFlow, scikit-learn

Professional Experience:

Staff Software Engineer - Amazon Web Services (2021 - Present)
- Architected multi-region active-active replication for DynamoDB Global Tables
- Led migration of 200+ microservices from EC2 to EKS (Kubernetes)

Senior Software Engineer - Google Cloud (2017 - 2021)
- Core contributor to Google Kubernetes Engine (GKE) autoscaler
- Designed and shipped BigQuery streaming insert optimization reducing p99 latency by 60%

CTO & Co-Founder - DataMesh (YC S16) (2015 - 2017)
- Built real-time data pipeline processing 50TB/day using Kafka and Spark
- Grew engineering team from 2 to 15 engineers

Education:
Ph.D. Computer Science - Carnegie Mellon University (2015)
B.S. Computer Engineering - IIT Bombay (2010)
`;

// ====================================================================
// TEST 4: Non-tech resume (marketing / business)
// ====================================================================
const resume4 = `
Samantha Lee
Los Angeles, CA | samantha.lee@gmail.com | (310) 555-4421
linkedin.com/in/samlee-marketing

Profile:
Creative digital marketing manager with 6 years of experience driving brand growth, content strategy, and paid acquisition campaigns for DTC e-commerce brands. Skilled in Google Ads, Meta Ads, SEO, and data-driven storytelling.

Experience:

Senior Marketing Manager - Glossier (2022 - Present)
- Managed $2.5M annual paid media budget across Google, Meta, and TikTok
- Increased organic traffic by 45% through SEO content strategy overhaul

Marketing Specialist - Warby Parker (2019 - 2022)
- Launched influencer partnership program generating 12M impressions
- A/B tested email campaigns improving click-through rates by 28%

Education:
MBA - UCLA Anderson School of Management (2019)
B.A. Communications - USC (2017)
`;

// ====================================================================
// Run all tests
// ====================================================================
const tests = [
  { name: 'Standard SWE Resume', text: resume1 },
  { name: 'Minimal Junior Dev Resume', text: resume2 },
  { name: 'Senior/Staff Engineer Resume', text: resume3 },
  { name: 'Non-Tech Marketing Resume', text: resume4 }
];

console.log('================================================================');
console.log('  AutoApply Resume Parser - Multi-Format Test Suite');
console.log('================================================================\n');

for (const test of tests) {
  console.log(`\n--- TEST: ${test.name} ---`);
  const result = parseResumeText(test.text);
  console.log(JSON.stringify(result, null, 2));
  console.log('');
}
