async function searchResults(keyword) {
    const results = [];
    const response = await fetchv2(`https://soaper.live/search.html?keyword=${keyword}`);
    const html = await response.text();

    const regex = /<div class="img-group">\s*<a href=['"]([^'"]+)['"]><img src=['"]([^'"]+)['"][^>]*><\/a>[\s\S]*?<h5><a href=['"][^'"]+['"]>([^<]+)<\/a>/g;

    let match;
    while ((match = regex.exec(html)) !== null) {
        results.push({
            title: match[3].trim(),
            image: "https://soaper.live" + match[2].trim(),
            href: "https://soaper.live" + match[1].trim()
        });
    }
    console.error(JSON.stringify(results));
    return JSON.stringify(results);
}

async function extractDetails(url) {
    const results = [];
    const response = await fetchv2(url);
    const html = await response.text();

    const regex = /<p id="wrap"[^>]*>\s*([\s\S]*?)\s*<\/p>/;
    const match = regex.exec(html);

    const description = match ? match[1].trim() : 'N/A';

    results.push({
        description: description,
        aliases: 'N/A',
        airdate: 'N/A'
    });

    return JSON.stringify(results);
}


async function extractEpisodes(url) {
    const results = [];
    const response = await fetchv2(url);
    const html = await response.text();
    const regex = /<a href="([^"]+)">\s*(\d+)\.[^<]+<\/a>/g;
    let match;
    
    while ((match = regex.exec(html)) !== null) {
        results.push({
            href: "https://soaper.live" + match[1].trim(),
            number: parseInt(match[2], 10)
        });
    }

    if (results.length === 0) {
        const movieRegex = /<a[^>]+href="https:\/\/twitter\.com\/home\/\?status=([^"]+)"/;        
        const movieMatch = movieRegex.exec(html);

        if (movieMatch) {
            results.push({
                href: movieMatch[1].trim(),
                number: 1
            });
        }
    }

    return JSON.stringify(results.reverse());
}

async function extractStreamUrl(url) {
    const response = await fetchv2(url);
    const firstHtml = await response.text();

    const idRegex = /<input type="hidden" id="hId" value="([^"]+)">/;
    const idMatch = idRegex.exec(firstHtml);


    const hId = idMatch ? idMatch[1] : null;
    console.error(hId);
    const postData = {
        pass: `${hId}`,
        param: "",
        extra: "",
        e2: "0",
        server: "1"
    };

    const headers = {
        "Referer": "https://soaper.live",
        "Content-Type": "application/json"
    };
    console.error(JSON.stringify(postData));

    const responseText = await fetchv2("https://soaper.live/home/index/GetMInfoAjax", headers, "POST", postData);
    const jsonResponse = await responseText.text();
    console.error(jsonResponse);

    const hlsRegex = /"val":"\\\/dev\\\/Apis\\\/tw_m3u8\?key=([^"]+)"/;
    const hlsMatch = hlsRegex.exec(jsonResponse);
    const hlsUrl = hlsMatch ? `/dev/Apis/tw_m3u8?key=${hlsMatch[1]}` : null;
    
    console.error(hlsUrl);
    return `https://soaper.live${hlsUrl}`;
}

