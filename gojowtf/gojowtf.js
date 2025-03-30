async function searchResults(keyword) {
    const results = [];
    const headers = {
        'Referer': 'https://gojo.wtf/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const response = await fetchv2(`https://backend.gojo.wtf/api/anime/search?query=${keyword}&page=1&perPage=35`, headers);
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

    const description = json.description || "No description available"; // Handling case where description might be missing

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
                href: `${id}/${episode.number}`, 
                number: episode.number
            });
        });
    }

    console.error(JSON.stringify(results));
    return JSON.stringify(results);
}

async function extractStreamUrl(url) {
    const [id, number] = url.split('/');  
    
    console.error(`ID: ${id}, Number: ${number}`);

    const headers = {
        'Referer': 'https://gojo.wtf/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const response = await fetchv2(`https://backend.gojo.wtf/api/anime/tiddies?provider=pahe&id=${id}&num=${number}&subType=sub&watchId=${number}&dub_id=null`, headers);
    const json = await response.json();

    const stream1080p = json.sources.find(source => source.quality === "1080p");

    if (stream1080p) {
        console.log(`1080p URL: ${stream1080p.url}`);
        return stream1080p.url;
    } else {
        console.error("1080p stream not found.");
        return null;
    }
}

