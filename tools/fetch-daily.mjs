import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target file paths
const EXISTING_PROMPTS_PATH = path.join(__dirname, '../extension/prompts.json');
const TARGET_DAILY_JSON_PATH = path.join(__dirname, '../extension/daily-add.json');

// Define data source
const SOURCE = {
    name: 'songguoxs',
    url: 'https://raw.githubusercontent.com/songguoxs/gpt4o-image-prompts/refs/heads/master/README.md',
    defaultAuthor: 'songguoxs'
};

// Helper to clean text
const cleanText = (text) => text ? text.trim() : '';

// Intelligent Markdown Parser
function parseMarkdown(markdown, source) {
    const prompts = [];
    const lines = markdown.split('\n');
    let currentPrompt = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 1. Identify Title (Lines starting with ## or ###)
        if (line.startsWith('##')) {
            // Save the previous prompt if it has at least a title and (prompt OR preview)
            if (currentPrompt && currentPrompt.title && (currentPrompt.prompt || currentPrompt.preview)) {
                prompts.push(currentPrompt);
            }

            // Start a new entry
            currentPrompt = {
                title: line.replace(/^#+\s*/, '').trim(), // Remove #
                preview: '',
                prompt: '',
                author: source.defaultAuthor,
                // Generate a link to the file/repo roughly
                link: source.url.replace('raw.githubusercontent.com', 'github.com').replace('/refs/heads', '/blob'), 
                mode: 'edit', // Default mode
                category: '生活', // Default category
                sub_category: ''
            };
            continue;
        }

        if (!currentPrompt) continue;

        // 2. Identify Image (Markdown ![]() or HTML <img src>)
        // We prioritize the first image found after the title
        if (!currentPrompt.preview) {
            const mdImgMatch = line.match(/!\[.*?\]\((.*?)\)/);
            const htmlImgMatch = line.match(/<img[^>]+src=["']([^"']+)["']/);
            
            let imgUrl = null;
            if (mdImgMatch) imgUrl = mdImgMatch[1];
            else if (htmlImgMatch) imgUrl = htmlImgMatch[1];

            if (imgUrl) {
                // Handle relative paths (basic handling)
                if (!imgUrl.startsWith('http')) {
                     // Construct a raw URL base
                     const baseUrl = source.url.substring(0, source.url.lastIndexOf('/'));
                     // Simple concatenation, might need adjustment for complex relative paths
                     if (imgUrl.startsWith('./')) {
                         imgUrl = `${baseUrl}/${imgUrl.substring(2)}`;
                     } else if (!imgUrl.startsWith('/')) {
                         imgUrl = `${baseUrl}/${imgUrl}`;
                     }
                }
                currentPrompt.preview = imgUrl;
            }
        }

        // 3. Identify Prompt Content (Code blocks ``` or Quote blocks >)
        // Strategy: If a line starts with ```, capture until next ```
        if (line.startsWith('```')) {
            let codeContent = '';
            i++; // Skip the opening ``` line
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeContent += lines[i] + '\n';
                i++;
            }
            // If we found content, append it
            if (cleanText(codeContent)) {
                if (!currentPrompt.prompt) {
                    currentPrompt.prompt = cleanText(codeContent);
                } else {
                    // If multiple code blocks, append with newline
                    currentPrompt.prompt += '\n\n' + cleanText(codeContent);
                }
            }
        }
        // Strategy: If a line starts with >, treat as quote/prompt
        else if (line.startsWith('>')) {
            const quoteContent = line.replace(/^>\s*/, '').trim();
            if (quoteContent) {
                currentPrompt.prompt = (currentPrompt.prompt ? currentPrompt.prompt + '\n' : '') + quoteContent;
            }
        }
    }

    // Push the last one
    if (currentPrompt && currentPrompt.title && (currentPrompt.prompt || currentPrompt.preview)) {
        prompts.push(currentPrompt);
    }

    return prompts;
}

async function main() {
    console.log('🚀 Starting Daily Prompt Fetcher...');
    
    // 1. Read existing prompts.json to use as deduplication base
    let existingPrompts = [];
    try {
        if (fs.existsSync(EXISTING_PROMPTS_PATH)) {
            const fileContent = fs.readFileSync(EXISTING_PROMPTS_PATH, 'utf-8');
            existingPrompts = JSON.parse(fileContent);
            console.log(`📖 Loaded existing library: ${existingPrompts.length} prompts`);
        }
    } catch (e) {
        console.warn('⚠️ Could not read existing file, assuming empty library.');
    }

    const newPrompts = [];

    // 2. Fetch from source
    try {
        console.log(`\n📥 Fetching from: ${SOURCE.name}`);
        const response = await fetch(SOURCE.url);
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        
        const markdown = await response.text();
        const extracted = parseMarkdown(markdown, SOURCE);
        
        console.log(`   ✅ Extracted ${extracted.length} items from source`);

        // 3. Compare and Filter
        for (const item of extracted) {
            // Deduplication logic: Check if title OR exact prompt already exists
            const exists = existingPrompts.some(p => 
                (p.title === item.title) || 
                (p.prompt && item.prompt && p.prompt === item.prompt)
            );

            if (!exists) {
                newPrompts.push(item);
            }
        }
        console.log(`   🆕 Found ${newPrompts.length} truly new prompts`);

    } catch (error) {
        console.error(`❌ Failed to fetch ${SOURCE.name}:`, error.message);
    }

    // 4. Write to extension/daily-add.json
    fs.writeFileSync(TARGET_DAILY_JSON_PATH, JSON.stringify(newPrompts, null, 4));
    
    console.log('\n🎉 ===========================================');
    console.log(`✅ Daily Fetch Complete!`);
    console.log(`🆕 New Prompts Saved: ${newPrompts.length}`);
    console.log(`💾 Saved to: ${TARGET_DAILY_JSON_PATH}`);
}

main();