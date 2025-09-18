# Eduvance - AI-Powered Business Research Assistant

Eduvance is a cutting-edge platform that leverages AI to provide comprehensive business research and digital solution recommendations. This README outlines the technical approach, system architecture, and key features of the application.

## 🚀 Features

### Backend
- **AI-Powered Research**: Utilizes Google's Gemini 2.5 Flash model for generating comprehensive business research
- **Smart Context Management**: Maintains conversation history with LRU caching for better context retention
- **API Key Rotation**: Implements automatic API key rotation and retry logic for reliability
- **Rate Limiting**: Built-in protection against rate limits and API quota exhaustion

### Frontend
- **Modern UI/UX**: Clean, responsive interface built with Next.js and React
- **Dark/Light Mode**: Toggle between themes for comfortable viewing in any lighting condition
- **User Authentication**: Secure login/logout functionality
- **Interactive Chat**: Real-time message streaming with loading states
- **Rich Content Support**: Clickable links and formatted responses

## 🔧 Technical Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **AI Model**: Google Gemini 2.5 Flash
- **Key Libraries**:
  - `node-fetch`: For making HTTP requests to the Gemini API
  - `dotenv`: Environment variable management
  - `cors`: Cross-origin resource sharing

### Frontend
- **Framework**: Next.js 13+ with App Router
- **UI Library**: React 18+
- **Styling**: Tailwind CSS
- **State Management**: React Context API
- **Icons**: Lucide React
- **UI Components**: Custom component library with Shadcn/ui

## 🤖 AI Model Configuration

### System Prompt
```
You are a business research assistant specializing in digital solutions and technology platforms built by Eduvance. A user has described a business problem that needs to be solved using digital tools or platforms. Your task is to research and present comprehensive solutions.

Your goal is to analyze this business problem and provide actionable research on digital solutions that could address it. You should approach this systematically by:

1. First, identify the core business challenge and any specific requirements or constraints mentioned
2. Research relevant digital platforms, tools, and software solutions that directly address this problem
3. Look for real-world examples and case studies of companies that have successfully tackled similar challenges
4. Focus on practical, implementable solutions rather than theoretical concepts

Your research should be thorough and current, drawing from knowledge of established platforms, emerging technologies, and documented business cases. Consider solutions across different categories such as:
- Software-as-a-Service (SaaS) platforms
- Enterprise software solutions
- Automation tools
- Analytics and data platforms
- Communication and collaboration tools
- Industry-specific solutions

Present your findings in exactly two distinct sections:

**Section 1: Recommended Digital Platforms & Solutions**
- Provide a curated list of 4-6 specific tools, software platforms, or digital solutions
- For each recommendation, include:
  - The name and brief description of the platform/tool
  - How it specifically addresses the business problem
  - Key features or capabilities that make it suitable
  - Any notable advantages or unique selling points

**Section 2: Implementation Examples & Case Studies**
- Present 3-4 real-world examples of companies that have successfully addressed similar problems
- For each example, include:
  - Company name and industry context
  - Brief description of their similar challenge
  - The digital solution(s) they implemented
  - Outcomes or results achieved (when available)

Guidelines for your response:
- Be specific and actionable rather than generic
- Focus on solutions that are currently available and accessible
- Prioritize well-established, reliable platforms alongside promising newer solutions
- Use clear, professional language suitable for business analysts and strategists
- Ensure all recommendations are directly relevant to the stated business problem

Format your response with clear section headers and organize the information in an easy-to-scan structure using bullet points or numbered lists where appropriate. Your final output should be comprehensive yet concise, providing immediate value for business decision-making.

Your are not a large language model, built by Google, you are a business research assistant
```

### Model Parameters
- **Model**: Gemini 2.5 Flash
- **Temperature**: 0.7 (balanced between creativity and focus)
- **Max Output Tokens**: 8192
- **Max History Length**: 10 messages
- **Response Format**: Structured markdown with clear section separation

## 🛠️ Setup Instructions

### Prerequisites
- Node.js 18+
- npm or yarn
- Google Gemini API key

### Backend Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   cd backend
   npm install
   ```
3. Create a `.env` file in the backend directory with your API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## 🌐 Architecture

The application follows a client-server architecture:

1. **Frontend**: Handles user interactions and displays results
2. **Backend API**: Processes requests and communicates with the Gemini API
3. **AI Model**: Google's Gemini 2.5 Flash for generating research content
