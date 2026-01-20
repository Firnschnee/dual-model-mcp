# Dual Model MCP Server
An MCP (Model Context Protocol) server that queries at the same time Claude Sonnet 4.5 and OpenAI GPT-5.1 via OpenRouter and returns structured responses.

## The Problem
Sometimes I witnessed, that an AI encounters a problem and is stuck with a certain perspective. 

## The Solution
A MCP Server that queries both Sonnet 4.5 and GPT-5.1 and gives you two answers with differenr perspectives.

## Features
- ⚡ Parallel queries of both models
- 📋 Structured responses (6-8 paragraphs, concise)
- 🔧 Easy integration into Cherry Studio / Claude Desktop
- 🎯 Customizable system prompts

## Installation
```bash
git clone https://github.com/Firnschnee/dual-model-mcp.git
cd dual-model-mcp
npm install
