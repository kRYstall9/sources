async function searchResults(keyword) {
    const response = await fetchv2(`https://v6.kuramanime.run/anime?search=${keyword}&order_by=oldest`);
    const html = await response.text();
    const results = [];

    const animeEntryRegex = /<a href="([^"]+)"[\s\S]*?<div class="product__sidebar__view__item set-bg" data-setbg="([^"]+)"[\s\S]*?<h5 class="sidebar-title-h5[^>]*>([^<]+)<\/h5>/g;
    const entries = html.matchAll(animeEntryRegex);
    for (const entry of entries) {
        const href = entry[1].trim();
        const imageUrl = entry[2].trim();
        const title = entry[3].trim();

        if (href && imageUrl && title) {
            results.push({
                title: title,
                href: href,
                image: imageUrl
            });
        }
    }

    console.log(JSON.stringify(results));
    return JSON.stringify(results);
}

async function extractDetails(url) {
    const response = await fetchv2(url);
    const html = await response.text();

    const details = [];
    const descriptionMatch = html.match(/<p id="synopsisField"[^>]*>([\s\S]*?)<\/p>/);

    const description = descriptionMatch ?
        descriptionMatch[1]
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/\s+/g, ' ')
        .trim() :
        'N/A';

    details.push({
        description: description,
        aliases: 'N/A',
        airdate: 'N/A'
    });

    console.log(details);
    return JSON.stringify(details);
}

async function extractEpisodes(url) {
    const response = await fetchv2(url);
    const html = await response.text();
    const episodes = [];
    const episodeLinks = [...html.matchAll(/<a\s+class=['"]btn btn-sm btn-secondary mb-1 mt-1['"]\s*href=['"]([^'"]+)['"][^>]*>\s*Ep\s*(\d+)/g)];

    if (episodeLinks.length === 0) {
        console.error("No episode links found in HTML");
        return episodes;
    }
    const episodeNumbers = episodeLinks.map(match => parseInt(match[2], 10));
    const minEpisode = Math.min(...episodeNumbers);
    const maxEpisode = Math.max(...episodeNumbers);
    const baseUrlMatch = episodeLinks[0][1].match(/(https:\/\/v6\.kuramanime\.run\/anime\/\d+\/[^/]+\/episode\/)[^/]+/);

    if (!baseUrlMatch) {
        console.error("Could not extract base URL");
        return episodes;
    }

    const baseUrl = baseUrlMatch[1];
    for (let episodeNumber = minEpisode; episodeNumber <= maxEpisode; episodeNumber++) {
        episodes.push({
            href: `${baseUrl}${episodeNumber}`,
            number: episodeNumber
        });
    }

    console.log("Extracted episodes:", JSON.stringify(episodes, null, 2));
    return JSON.stringify(episodes);
}

async function extractStreamUrl(url) {
    console.log(url);
    const response = await fetchv2(`${url}?sVW6Ar1iYqiteu1=0dQAWttc7l&B8HzA5nmDbcUZan=kuramadrive&page=1`);
    const html = await response.text();

    const kDriveRegex = /<h6 class="text-white mt-3 font-weight-bold">\s*MP4 480p \(Hardsub\)[^<]*<\/h6>[\s\S]*?<a href="([^"]+)"[^>]*>\s*kDrive\s*</g;
    const match = kDriveRegex.exec(html);
    const streamUrl = match[1].trim();

    const codeMatch = streamUrl.match(/\/([^/]+)$/);
    const fileCode = codeMatch[1];
    const apiUrl = `https://kuramadrive.com/api/v1/drive/file/${fileCode}/check`;

    const postData = {
        domain: "https://villhaze.my.id",
        token: ""
    };

    const headers = {
        "Content-Type": "multipart/form-data",
        "Authorization": "Bearer qRmmW9IENUUKLXneWDhiWIFyvnS6ttlM",
        "Origin": "https://kuramadrive.com",
        "Alt-Used": "kuramadrive.com",
        "Cookie": "XSRF-TOKEN=...; kuramadrive_by_kuramanime_session=...",
        "Content-Type": "application/json"
    };

    try {
        const responseText = await fetchv2(apiUrl, headers, "POST", JSON.stringify(postData));
        const responseData = await responseText.text();
        console.log(responseData);
        let finalUrl = null;
        try {
            console.log(responseData)
            const urlMatch = responseData.match(/"url":"(https:\\\/\\\/[^"]+)"/);

            if (urlMatch && urlMatch[1]) {
                finalUrl = urlMatch[1].replace(/\\\//g, '/');
            } else {
                console.log("error mf");
            }
        } catch (parseError) {
        }

        console.log(finalUrl);
        return finalUrl;
    } catch (error) {
        return null;
    }
}
