///////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////       Main Functions          //////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////

async function searchResults(keyword) {
    try {

        const encodedKeyword = encodeURIComponent(keyword);
        const searchUrl = `https://animekai.to/browser?keyword=${encodedKeyword}`;
        const responseText = await fetch(searchUrl);

        const results = [];
        const baseUrl = "https://animekai.to";

        const listRegex = /<div class="aitem">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
        let match;

        while ((match = listRegex.exec(responseText)) !== null) {
            const block = match[1];

            const hrefRegex = /<a[^>]+href="([^"]+)"[^>]*class="poster"[^>]*>/;
            const hrefMatch = block.match(hrefRegex);
            let href = hrefMatch ? hrefMatch[1] : null;
            if (href && !href.startsWith("http")) {
                href = href.startsWith("/")
                    ? baseUrl + href
                    : baseUrl + href;
            }

            const imgRegex = /<img[^>]+data-src="([^"]+)"[^>]*>/;
            const imgMatch = block.match(imgRegex);
            const image = imgMatch ? imgMatch[1] : null;

            const titleRegex = /<a[^>]+class="title"[^>]+title="([^"]+)"[^>]*>/;
            const titleMatch = block.match(titleRegex);
            const title = cleanHtmlSymbols(titleMatch ? titleMatch[1] : null);

            if (href && image && title) {
                results.push({ href, image, title });
            }
        }

        return JSON.stringify(results);
    }
    catch (error) {
        console.log('SearchResults function error' + error);
        return JSON.stringify(
            [{ href: 'https://error.org', image: 'https://error.org', title: 'Error' }]
        );
    }
}

async function extractDetails(url) {
    try {

        const fetchUrl = `${url}`;
        const responseText = await fetch(fetchUrl);

        const details = [];

        const descriptionMatch = /<div class="desc text-expand">([\s\S]*?)<\/div>/;
        let description = descriptionMatch.exec(responseText);

        const aliasesMatch = /<small class="al-title text-expand">([\s\S]*?)<\/small>/;
        let aliases = aliasesMatch.exec(responseText);

        if (description && aliases) {
            details.push({
                description: description[1] ? cleanHtmlSymbols(description[1]) : "Not available",
                aliases: aliases[1] ? cleanHtmlSymbols(aliases[1]) : "Not available",
                airdate: "Not available"
            });
        }

        return JSON.stringify(details);
    }
    catch (error) {
        console.log('Details error:' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Aliases: Unknown',
            airdate: 'Aired: Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {

        const fetchUrlForId = `${url}`;
        const responseTextForId = await fetch(fetchUrlForId);

        const rateBoxIdRegex = /<div class="rate-box"[^>]*data-id="([^"]+)"/;
        const idMatch = responseTextForId.match(rateBoxIdRegex);
        const aniId = idMatch ? idMatch[1] : null;
        const urlFetchToken = KAICODEX.enc(aniId);

        const fetchUrlListApi = `https://animekai.to/ajax/episodes/list?ani_id=${aniId}&_=${urlFetchToken}`;
        const responseTextListApi = await fetch(fetchUrlListApi);

        const data = await JSON.parse(responseTextListApi);

        let htmlContentListApi = "";
        htmlContentListApi = cleanJsonHtml(data.result);

        // Continue with the extraction
        const episodes = [];

        // Regular expression to find all <a> tags with num and token attributes
        const episodeRegex = /<a[^>]+num="([^"]+)"[^>]+token="([^"]+)"[^>]*>/g;
        let epMatch;

        while ((epMatch = episodeRegex.exec(htmlContentListApi)) !== null) {
            const num = epMatch[1];
            const token = epMatch[2];
            const tokenEncoded = KAICODEX.enc(token);
            const episodeUrl = `https://animekai.to/ajax/links/list?token=${token}&_=${tokenEncoded}`;

            episodes.push({
                href: episodeUrl,
                number: parseInt(num, 10)
            });
        }

        return JSON.stringify(episodes);
    }
    catch (error) {
        console.log('Fetch error:' + error);
        return JSON.stringify([{ number: '0', href: '' }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const baseUrl = 'https://aniworld.to';
        const fetchUrl = `${url}`;
        const text = await fetch(fetchUrl);

        const cleanedHtml = cleanJsonHtml(text);

        // Extract div blocks with their content
        const subRegex = /<div class="server-items lang-group" data-id="sub"[^>]*>([\s\S]*?)<\/div>/;
        const softsubRegex = /<div class="server-items lang-group" data-id="softsub"[^>]*>([\s\S]*?)<\/div>/;
        const dubRegex = /<div class="server-items lang-group" data-id="dub"[^>]*>([\s\S]*?)<\/div>/;

        const subMatch = subRegex.exec(cleanedHtml);
        const softsubMatch = softsubRegex.exec(cleanedHtml);
        const dubMatch = dubRegex.exec(cleanedHtml);

        // Store the content in variables
        const sub = subMatch ? subMatch[1].trim() : "";
        const softsub = softsubMatch ? softsubMatch[1].trim() : "";
        const dub = dubMatch ? dubMatch[1].trim() : "";

        let dataLid = "";
        let fetchUrlServerApi = "";
        let KaiMegaUrlJson = "";
        let megaELinkJson = ""
        let megaEmbeddedUrl = "";
        let megaMediaUrl = "";
        let streamUrlJson = "";
        let streamUrl = "";

        if (dub) {
            // Find server 1 span and extract data-lid
            const serverSpanRegex = /<span class="server"[^>]*data-lid="([^"]+)"[^>]*>Server 1<\/span>/;
            const serverMatch = serverSpanRegex.exec(dub);

            if (serverMatch && serverMatch[1]) {
                dataLid = serverMatch[1];
                dataLidToken = KAICODEX.enc(dataLid);

                // https://animekai.to/ajax/links/view?id=dIS48a6p6A&_=UVpJN001ckY4cHh4R3I4QVJWM2RqTFdCeFQ
                fetchUrlServerApi = `https://animekai.to/ajax/links/view?id=${dataLid}&_=${dataLidToken}`;

                const responseTextServerApi = await fetch(fetchUrlServerApi);
                const dataServerApi = await JSON.parse(responseTextServerApi);

                KaiMegaUrlJson = KAICODEX.dec(dataServerApi.result);
                megaELinkJson = JSON.parse(KaiMegaUrlJson);
                megaEmbeddedUrl = megaELinkJson.url;
                megaMediaUrl = megaEmbeddedUrl.replace("/e/", "/media/");

                // Fetch the media url
                const mediaUrl = await fetch(megaMediaUrl);
                const mediaText = await mediaUrl;
                const mediaJson = await JSON.parse(mediaText);

                streamUrlJson = mediaJson.result;
                streamUrlJson = KAICODEX.decMega(streamUrlJson);
                const parsedStreamData = JSON.parse(streamUrlJson);

                if (parsedStreamData && parsedStreamData.sources && parsedStreamData.sources.length > 0) {
                    streamUrl = parsedStreamData.sources[0].file;
                } else {
                    console.log('No stream sources found in the response' + parsedStreamData);
                }

            }
        }

        return streamUrl;
    }
    catch (error) {
        console.log('Fetch error:' + error);
        return "https://error.org";
    }
}


////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////       Helper Functions       ////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////

function cleanHtmlSymbols(string) {
    if (!string) return "";

    return string
        .replace(/&#8217;/g, "'")
        .replace(/&#8211;/g, "-")
        .replace(/&#[0-9]+;/g, "")
        .replace(/\r?\n|\r/g, " ")  // Replace any type of newline with a space
        .replace(/\s+/g, " ")       // Replace multiple spaces with a single space
        .trim();                    // Remove leading/trailing whitespace
}

function cleanJsonHtml(jsonHtml) {
    if (!jsonHtml) return "";

    return jsonHtml
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r');
}

// Credits to @AnimeTV Project for the KAICODEX
const KAICODEX = {
    /* ANIMEKAI CODEX */
    enc(n) {
        var u = KAICODEX.safeBtoa;
        var a = KAICODEX.rc4;
        var s = KAICODEX.replaceChars;
        var r = KAICODEX.reverseString;
        n = u(
            s(
                u(
                    a(
                        'sXmH96C4vhRrgi8',
                        r(
                            r(
                                u(
                                    a('kOCJnByYmfI', s(
                                        s(
                                            r(
                                                u(
                                                    a('0DU8ksIVlFcia2', n)
                                                )
                                            ),
                                            '1wctXeHqb2', '1tecHq2Xbw'
                                        ),
                                        '48KbrZx1ml', 'Km8Zb4lxr1'
                                    )
                                    )
                                )
                            )
                        )
                    )
                ), 'hTn79AMjduR5', 'djn5uT7AMR9h')
        );
        return encodeURIComponent(n);
    },
    encPlain(n) {
        return KAICODEX.safeBtoa(KAICODEX.rc4(
            'n1PEbDBiipbJZvZc',
            encodeURIComponent(n)
        ));
    },
    dec(n) {
        var u = KAICODEX.safeAtob;
        var a = KAICODEX.rc4;
        var s = KAICODEX.replaceChars;
        var r = KAICODEX.reverseString;
        n = a(
            '0DU8ksIVlFcia2',
            u(
                r(
                    s(
                        s(
                            a('kOCJnByYmfI',
                                u(
                                    r(
                                        r(
                                            a(
                                                'sXmH96C4vhRrgi8',
                                                u(
                                                    s(
                                                        u(n),
                                                        'djn5uT7AMR9h',
                                                        'hTn79AMjduR5'
                                                    )
                                                )
                                            )
                                        )
                                    )
                                )
                            ), 'Km8Zb4lxr1', '48KbrZx1ml'
                        ),
                        '1tecHq2Xbw', '1wctXeHqb2'
                    )
                )
            )
        )
        return decodeURIComponent(n);
    },
    decPlain(n) {
        return decodeURIComponent(
            KAICODEX.rc4(
                'n1PEbDBiipbJZvZc',
                KAICODEX.safeAtob(n)
            )
        );
    },
    decMega(n) {
        var base64_url_decode = KAICODEX.safeAtob;
        var transform = KAICODEX.rc4;
        var substitute = KAICODEX.replaceChars;
        var reverse_it = KAICODEX.reverseString;

        n = substitute(
            transform(
                "Pga3kHbfN1",
                base64_url_decode(
                    reverse_it(
                        substitute(
                            transform(
                                "twUI4s9kDrT3qb",
                                base64_url_decode(
                                    reverse_it(
                                        substitute(
                                            transform(
                                                "TyrGFfhi40zq",
                                                base64_url_decode(
                                                    reverse_it(base64_url_decode(n))
                                                )
                                            ),
                                            "4zSetv9CNImRdiq",
                                            "i94NvzeIRCqdtSm"
                                        )
                                    )
                                )
                            ),
                            "vfIiqFKutaW",
                            "tqaiKIfuvWF"
                        )
                    )
                )
            ),
            "vnb0rLzdZN6a",
            "vNZnrzd60baL"
        );
        return decodeURIComponent(n);
    },

    /* Helper */
    rc4: function (key, str) {
        var s = [], j = 0, x, res = '';
        for (var i = 0; i < 256; i++) {
            s[i] = i;
        }
        for (i = 0; i < 256; i++) {
            j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
            x = s[i];
            s[i] = s[j];
            s[j] = x;
        }
        i = 0;
        j = 0;
        for (var y = 0; y < str.length; y++) {
            i = (i + 1) % 256;
            j = (j + s[i]) % 256;
            x = s[i];
            s[i] = s[j];
            s[j] = x;
            res += String.fromCharCode(str.charCodeAt(y) ^ s[(s[i] + s[j]) % 256]);
        }
        return res;
    },
    safeBtoa: function (s) {
        return btoa(s).replace(/\//g, '_').replace(/\+/g, '-').replace(/\=/g, '');
    },
    safeAtob: function (s) {
        return atob(s.replace(/_/g, '/').replace(/-/g, '+'));
    },
    reverseString: function (s) {
        return s.split('').reverse().join('');
    },
    replaceChars: function (s, f, r) {
        let i = f.length;
        let m = {};
        while (i-- && (m[f[i]] = r[i])) { }
        return s.split("").map(v => m[v] || v).join('');
    }
};



function btoa(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = String(input);
    let output = '';

    for (let block = 0, charCode, i = 0, map = chars;
        str.charAt(i | 0) || (map = '=', i % 1);
        output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))) {
        charCode = str.charCodeAt(i += 3 / 4);
        if (charCode > 0xFF) {
            throw new Error("btoa failed: The string contains characters outside of the Latin1 range.");
        }
        block = (block << 8) | charCode;
    }

    return output;
}

function atob(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = String(input).replace(/=+$/, '');
    let output = '';

    if (str.length % 4 == 1) {
        throw new Error("atob failed: The input is not correctly encoded.");
    }

    for (let bc = 0, bs, buffer, i = 0;
        (buffer = str.charAt(i++));
        ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4)
            ? output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)))
            : 0) {
        buffer = chars.indexOf(buffer);
    }

    return output;
}


