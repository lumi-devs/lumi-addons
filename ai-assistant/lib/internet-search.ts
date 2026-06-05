export async function searchInternet(query: string): Promise<string> {
  try {
    const body = new URLSearchParams();
    body.append("q", query);

    const response = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      return `Failed to search the internet: HTTP ${response.status}`;
    }

    const html = await response.text();
    
    // Extract text from elements with class 'result-snippet'
    const snippetRegex = /<td class='result-snippet'>([\s\S]*?)<\/td>/g;
    let match;
    const snippets = [];
    
    while ((match = snippetRegex.exec(html)) !== null) {
      // Remove HTML tags from the snippet
      const cleanText = match[1].replace(/<[^>]*>/g, "").trim();
      if (cleanText) snippets.push(cleanText);
    }

    if (snippets.length === 0) {
      return `No results found on the internet for "${query}".`;
    }

    return `Search results for "${query}":\n\n` + snippets.map((s, i) => `${i + 1}. ${s}`).join("\n");
  } catch (error: any) {
    return `Error performing internet search: ${error.message}`;
  }
}
