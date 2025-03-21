async function searchResults(keyword) {
    const searchUrl = `https://kimcartoon.com.co/?s=${encodeURIComponent(keyword)}`;
    try {
        const response = await fetch(searchUrl);
        const html = await response;
        const results = [];

        const articleRegex = /<article[^>]*class="bs styletwo"[\s\S]*?<\/article>/g;
        const items = html.match(articleRegex) || [];

        items.forEach((itemHtml) => {
            const titleMatch = itemHtml.match(/<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"/);
            const imgMatch = itemHtml.match(/<img[^>]*src="([^"]+)"/);

            if (!titleMatch || !imgMatch) return;

            const href = `${titleMatch[1].trim()}?video_index=2`;
            const title = titleMatch[2].trim();
            const imageUrl = imgMatch[1].trim();

            results.push({ title, image: imageUrl, href });
        });
        //console.log(results);
        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        throw error;
    }
}

async function extractDetails(url) {
    const response = await fetch(url);
    const html = await response;
    const details = [];
    const descriptionMatch = html.match(/<div class="entry-content" itemprop="description">\s*<p>(.*?)<\/p>/);
    const description = descriptionMatch ? descriptionMatch[1].trim() : `N/A`;

    details.push({
        description,
        alias: 'N/A',
        airdate: 'N/A'
    });

    console.log(JSON.stringify(details));
    return JSON.stringify(details);
}

async function extractEpisodes(url) {
    const response = await fetch(url);
    const html = await response;
    const episodes = [];

    const episodeMatches = [...html.matchAll(/<li[^>]*>\s*<a href="([^"]+)">\s*<div class="epl-title">Episode (\d+) <\/div>/g)];
    const movieMatch = html.match(/<li[^>]*>\s*<a href="([^"]+)">\s*<div class="epl-title">Movie <\/div>/);

    for (const match of episodeMatches) {
        episodes.push({
            href: match[1].trim(),
            number: parseInt(match[2], 10)
        });
    }
    if (movieMatch) {
        episodes.push({
            href: movieMatch[1].trim(),
            number: 1
        });
    }

    //console.log(episodes);
    console.log(JSON.stringify(episodes));
    return JSON.stringify(episodes);
}

async function extractStreamUrl(url) {
    const embedResponse = await fetch(url);
    const data = await embedResponse;

    const embedMatch = data.match(/<div class="pembed" data-embed="(\/\/.*?)"/);

    if (embedMatch && embedMatch[1]) {
        const embedUrl = embedMatch[1];
        const fullEmbedUrl = 'https:' + embedUrl.trim();
        console.log(fullEmbedUrl);

        const embedPageResponse = await fetch(fullEmbedUrl);
        const embedPageData = await embedPageResponse;
        console.log(embedPageData);

        const m3u8Match = embedPageData.match(/sources:\s*\[\{file:"(https:\/\/[^"]*\.m3u8)"/);

        if (m3u8Match && m3u8Match[1]) {
            const m3u8Url = m3u8Match[1];
            console.log(m3u8Url);
            return m3u8Url;
        } else {
            throw new Error("M3U8 URL not found.");
        }
    } else {
        throw new Error("Embed URL not found.");
    }
}
