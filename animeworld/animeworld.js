function searchResults(html) {
    const results = [];
    const baseUrl = "https://animeworld.ac";
    
    const filmListRegex = /<div class="film-list">([\s\S]*?)<div class="clearfix"><\/div>\s*<\/div>/;
    const filmListMatch = html.match(filmListRegex);
    
    if (!filmListMatch) {
        return results;
    }
    
    const filmListContent = filmListMatch[1];
    const itemRegex = /<div class="item">[\s\S]*?<\/div>[\s]*<\/div>/g;
    const items = filmListContent.match(itemRegex) || [];
    
    items.forEach(itemHtml => {
        const imgMatch = itemHtml.match(/src="([^"]+)"/);
        let imageUrl = imgMatch ? imgMatch[1] : '';
        
        const titleMatch = itemHtml.match(/class="name">([^<]+)</);
        const title = titleMatch ? titleMatch[1] : '';
        
        const hrefMatch = itemHtml.match(/href="([^"]+)"/);
        let href = hrefMatch ? hrefMatch[1] : '';
        
        if (imageUrl && title && href) {
            if (!imageUrl.startsWith("https")) {
                if (imageUrl.startsWith("/")) {
                    imageUrl = baseUrl + imageUrl;
                } else {
                    imageUrl = baseUrl + "/" + href;
                }
            }
            if (!href.startsWith("https")) {
                if (href.startsWith("/")) {
                    href = baseUrl + href;
                } else {
                    href = baseUrl + "/" + href;
                }
            }
            results.push({
                title: title.trim(),
                image: imageUrl,
                href: href
            });
        }
    });
    return results;
}

function extractDetails(html) {
    const details = [];
    
    const descriptionMatch = html.match(/<div class="desc">([\s\S]*?)<\/div>/);
    let description = descriptionMatch ? descriptionMatch[1] : '';
    
    const aliasesMatch = html.match(/<h2 class="title" data-jtitle="([^"]+)">/);
    let aliases = aliasesMatch ? aliasesMatch[1] : '';
    
    const airdateMatch = html.match(/<dt>Data di Uscita:<\/dt>\s*<dd>([^<]+)<\/dd>/);
    let airdate = airdateMatch ? airdateMatch[1] : '';
    
    if (description && aliases && airdate) {
        details.push({
            description: description,
            aliases: aliases,
            airdate: airdate
        });
    }
    
    return details;
}

function extractEpisodes(html) {
    const episodes = [];
    const baseUrl = "https://animeworld.ac";
    
    const serverActiveRegex = /<div class="server active"[^>]*>([\s\S]*?)<\/ul>\s*<\/div>/;
    const serverActiveMatch = html.match(serverActiveRegex);
    
    if (!serverActiveMatch) {
        return episodes;
    }
    
    const serverActiveContent = serverActiveMatch[1];
    const episodeRegex = /<li class="episode">\s*<a[^>]*?href="([^"]+)"[^>]*?>([^<]+)<\/a>/g;
    let match;
    
    while ((match = episodeRegex.exec(serverActiveContent)) !== null) {
        let href = match[1];
        const number = match[2];
        
        if (!href.startsWith("https")) {
            if (href.startsWith("/")) {
                href = baseUrl + href;
            } else {
                href = baseUrl + "/" + href;
            }
        }
        
        episodes.push({
            href: href,
            number: number
        });
    }
    
    return episodes;
}

function extractStreamUrl(html) {
    const idRegex = /<a[^>]+href="([^"]+)"[^>]*id="alternativeDownloadLink"/;
    const match = html.match(idRegex);
    return match ? match[1] : null;
}

