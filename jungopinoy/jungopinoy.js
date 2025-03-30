async function searchResults(keyword) {
    const results = [];
    const response = await fetchv2("https://jungopinoy.com/");
    const html = await response.text();
    const regex = /<div id='divSlide_(\d+)'[^>]*>\s*<a href='javascript: openPlayerNew\("\d+",.*?"(images\/stream_images\/[^"]+)"\)'>/g;
    let match;
    const keywordLower = keyword.toLowerCase();
    const uniqueTitles = new Set();
    
    while ((match = regex.exec(html)) !== null) {
      let rawTitle = match[2].split('/').pop();
      
      let title = rawTitle
        .replace(/\.\w+$/, '')
        .replace(/^\d+_[a-f0-9]+_/i, '')
        .replace(/[_-]/g, ' ')
        .replace(/\b\d+x\d+\b/g, '')
        .replace(/\s+\(\d+\)$|\s+\d+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (!/EPISODE/i.test(title) && 
          title.toLowerCase().includes(keywordLower) && 
          !uniqueTitles.has(title.toLowerCase())) {
        uniqueTitles.add(title.toLowerCase());
        
        results.push({
          title: title,
          image: "https://jungopinoy.com/" + match[2],
          href: match[1]
        });
      }
    }
    
    console.error(JSON.stringify(results));
    return JSON.stringify(results);
  }

  async function extractDetails(id) {
    const results = [];
    const response = await fetchv2(`https://swigappmanager.com/feed/v1/stream_detail4/${id}/1/`);
    const json = await response.json();

    const description = json.app.stream_details.streamdescription;

    results.push({
        description: description,
        aliases: 'N/A',
        airdate: 'N/A'
    });

    return JSON.stringify(results);
}


async function extractEpisodes(id) {
    const results = [];
    const response = await fetchv2(`https://swigappmanager.com/feed/v1/stream_detail4/${id}/1/`);
    const json = await response.json();

    const episodes = json.app.episode_streams;
    
    episodes.forEach((episode, index) => {
        results.push({
            href: episode.streamUrl,  
            number: index + 1  
        });
    });
    console.error(JSON.stringify(results));
    return JSON.stringify(results);
}


async function extractStreamUrl(url) {    
    return url;
  }
