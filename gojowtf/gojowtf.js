async function searchResults(keyword) {
    const results = [];
    const headers = {
        'Referer': 'https://gojo.wtf/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const encodedKeyword = encodeURIComponent(keyword);
    const response = await fetchv2(`https://backend.gojo.wtf/api/anime/search?query=${encodedKeyword}&page=1`, headers);
    const json = await response.json();

    json.results.forEach(anime => {
        const title = anime.title.english || anime.title.romaji || anime.title.native || "Unknown Title";
        const image = anime.coverImage.large;
        const href = `${anime.id}`;

        if (title && href && image) {
            results.push({
                title: title,
                image: image,
                href: href
            });
        } else {
            console.error("Missing or invalid data in search result item:", {
                title,
                href,
                image
            });
        }
    });

    return JSON.stringify(results);
}

async function extractDetails(id) {
    const results = [];
    const headers = {
        'Referer': 'https://gojo.wtf/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const response = await fetchv2(`https://backend.gojo.wtf/api/anime/info/${id}`, headers);
    const json = await response.json();

    const description = cleanHtmlSymbols(json.description) || "No description available"; // Handling case where description might be missing

    results.push({
        description: description.replace(/<br>/g, ''),
        aliases: 'N/A',
        airdate: 'N/A'
    });

    return JSON.stringify(results);
}

async function extractEpisodes(id) {
    const results = [];
    const headers = {
        'Referer': 'https://gojo.wtf/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const response = await fetchv2(`https://backend.gojo.wtf/api/anime/episodes/${id}`, headers);
    const json = await response.json();

    const paheProvider = json.find(provider => provider.providerId === "pahe");

    if (paheProvider && paheProvider.episodes) {
        paheProvider.episodes.forEach(episode => {
            results.push({
                href: `${id}/${episode.id}/${episode.number}`, 
                number: episode.number
            });
        });
    }

    console.error(JSON.stringify(results));
    return JSON.stringify(results);
}

async function extractStreamUrl2(url) {
    const [id, number, episodeId] = url.split('/');  
    
    console.error(`ID: ${id}, Number: ${number}, Episode ID: ${episodeId}`);

    const headers = {
        headers: {
            'Referer': 'https://gojo.wtf/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
    };

    const response = await fetch(`https://backend.gojo.wtf/api/anime/tiddies?provider=pahe&id=${id}&num=${number}&subType=sub&watchId=${episodeId}&dub_id=null`, headers);
    const json = await response.json();

    let streams = [];

    const quality = json.sources.map(stream => stream.quality);
    const stream = json.sources.map(stream => stream.url);

    for (let i = 0; i < stream.length; i++) {
        streams.push(quality[i]);
        streams.push(stream[i]);
    }

    const result = {
        streams: streams
    };

    console.log(JSON.stringify(result));
    return JSON.stringify(result);
}

function cleanHtmlSymbols(string) {
    if (!string) return "";

    return string
        .replace(/&#8217;/g, "'")
        .replace(/&#8211;/g, "-")
        .replace(/&#[0-9]+;/g, "")
        .replace(/\r?\n|\r/g, " ")  // Replace any type of newline with a space
        .replace(/\s+/g, " ")       // Replace multiple spaces with a single space
        .replace(/<i[^>]*>(.*?)<\/i>/g, "$1")
        .replace(/<b[^>]*>(.*?)<\/b>/g, "$1") 
        .replace(/<[^>]+>/g, "")
        .trim();                    // Remove leading/trailing whitespace
}
