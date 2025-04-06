async function searchResults(keyword) {
    const results = [];
    const postData = {
      do: "search",
      subaction: "search",
      story: `${keyword}`
    };
    const headers = {
      "Alt-Used": "kuramadrive.com",
      "Content-Type": "application/json"
    };
    const response = await fetchv2(`https://french-anime.com/`, headers, "POST", postData);
    const html = await response.text();
  
    const regex = /<div class="mov clearfix">[\s\S]*?<img src="([^"]+)"[\s\S]*?data-link="([^"]+)"[\s\S]*?<a class="mov-t nowrap"[^>]*>([^<]+)</g;
    
    let match;
    while ((match = regex.exec(html)) !== null) {
      results.push({
        image: "https://french-anime.com" + match[1].trim(),
        href: match[2].trim(),
        title: match[3].trim()
      });
    }
    console.error(JSON.stringify(results));

    return JSON.stringify(results);
  }

  async function extractDetails(url) {
    const results = [];
    const response = await fetchv2(url);
    const html = await response.text();
    
    const descriptionRegex = /<div class="mov-label">Synopsis:<\/div>\s*<div class="mov-desc"><span\s+itemprop="description">([^<]+)<\/span><\/div>/s;
    const match = html.match(descriptionRegex);
    
    results.push({
      description: match ? match[1].trim() : 'N/A',
      aliases: 'N/A',
      airdate: 'N/A'
    });
    
    return JSON.stringify(results);
  }

  async function extractEpisodes(url) {
    const results = [];
    const response = await fetchv2(url);
    const html = await response.text();
    const episodesRegex = /(\d+)![^,]+,([^,]+)/g;
    let match;
    while ((match = episodesRegex.exec(html)) !== null) {
      results.push({
        href: match[2].trim(),
        number: parseInt(match[1], 10)
      });
    }
    console.error(JSON.stringify(results));
    return JSON.stringify(results);
  }

  async function extractStreamUrl(url) {
    const code = url.split('/')[url.split('/').length - 1];
    const newUrl = `https://nathanfromsubject.com/e/${code}`;
    const response = await fetchv2(newUrl);
    const html = await response.text();
    
    // Updated regex to handle multiline and whitespace
    const sourcesRegex = /var\s+sources\s*=\s*{[^]*?'hls'\s*:\s*'([^']+)'/s;
    const match = html.match(sourcesRegex);
    
    if (match) {
      // Decode the base64 string
      const decodedUrl = atob(match[1]);
      return decodedUrl;
    }
    
    return null;
  }
