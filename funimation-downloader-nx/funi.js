#!/usr/bin/env node

// modules build-in
const fs = require('fs');
const path = require('path');
const url = require('url');

// package json
const packageJson = require(path.join(__dirname,'package.json'));

// program name
console.log(`\n=== Funimation Downloader NX ${packageJson.version} ===\n`);
const api_host = `https://prod-api-funimationnow.dadcdigital.com/api`;

// request
const got = require('got').extend({
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:65.0) Gecko/20100101 Firefox/65.0' },
});

// proxy
const ProxyAgent = require('proxy-agent');

// modules extra
const yaml = require('yaml');
const shlp = require('sei-helper');
const yargs = require('yargs');
const FormData = require('form-data');

// m3u8 and ttml
const m3u8 = require('m3u8-parsed');
const streamdl = require('hls-download');
const { ttml2srt } = require('ttml2srt');

// config
const configFile = path.join(__dirname,'/modules/config.main.yml');
const tokenFile = path.join(__dirname,'/modules/config.token.yml');

// params
let cfg = {};
let token = false;

if(!fs.existsSync(configFile)){
    console.log(`[ERROR] config file not found!`);
    process.exit();
}
else{
    cfg = yaml.parse(
        fs.readFileSync(configFile, 'utf8')
            .replace(/\${__dirname}/g,__dirname.replace(/\\/g,'/'))
    );
}

if(fs.existsSync(tokenFile)){
    token = yaml.parse(fs.readFileSync(tokenFile, 'utf8'));
    if(token && token.token){
        token = token.token;
        // console.log(`[INFO] Token: %s%s\n`, token.slice(0,8), '*'.repeat(32));
    }
    else{
        token = false;
        console.log(`[INFO] Token not set!\n`);
    }
}
else{
    console.log(`[INFO] Token not set!\n`);
}

// cli
let argv = yargs
    .wrap(Math.min(100))
    .usage('Usage: $0 [options]')
    .help(false).version(false)
    
    // auth
    .describe('auth','Enter auth mode')
    
    // search
    .describe('search','Sets the show title for search')
    
    // params
    .describe('s','Sets the show id')
    .describe('e','Select episode ids (comma-separated, hyphen-sequence)')
    
    .describe('q','Video layer (0 is max)')
    .choices('q', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    .default('q', cfg.cli.videoLayer)
    
    .describe('alt','Alternative episode listing (if available)')
    .boolean('alt')
    
    .describe('sub','Subtitles mode (Dub mode by default)')
    .boolean('sub')
    
    .describe('simul','Forсe download simulcast version instead of uncut')
    .boolean('simul')
    
    .describe('x','Select server')
    .choices('x', [1, 2, 3, 4])
    .default('x', cfg.cli.nServer)
    
    .describe('novids', 'Skip download videos')
    .boolean('novids')
    
    .describe('nosubs','Skip download subtitles for Dub (if available)')
    .boolean('nosubs')
    
    // proxy
    .describe('proxy','http(s)/socks proxy WHATWG url (ex. https://myproxyhost:1080/)')
    .describe('proxy-auth','Colon-separated username and password for proxy')
    .describe('ssp','Ignore proxy settings for stream downloading')
    .boolean('ssp')
    
    .describe('mp4','Mux into mp4')
    .boolean('mp4')
    .default('mp4',cfg.cli.mp4mux)
    .describe('mks','Add subtitles to mkv or mp4 (if available)')
    .boolean('mks')
    .default('mks',cfg.cli.muxSubs)
    
    .describe('a','Filenaming: Release group')
    .default('a',cfg.cli.releaseGroup)
    .describe('t','Filenaming: Series title override')
    .describe('ep','Filenaming: Episode number override (ignored in batch mode)')
    .describe('suffix','Filenaming: Filename suffix override (first "SIZEp" will be replaced with actual video size)')
    .default('suffix',cfg.cli.fileSuffix)
    
    // util
    .describe('nocleanup','move temporary files to trash folder instead of deleting')
    .boolean('nocleanup')
    .default('nocleanup',cfg.cli.noCleanUp)
    
    // help
    .describe('h','Show this help')
    .alias('h','help')
    .boolean('h')
    
    .version(false)
    .help(false)
    .argv;

// check page
if(!isNaN(parseInt(argv.p, 10)) && parseInt(argv.p, 10) > 0){
    argv.p = parseInt(argv.p, 10);
}
else{
    argv.p = 1;
}

// fn variables
let fnTitle = '',
    fnEpNum = '',
    fnSuffix = '',
    fnOutput = '',
    tsDlPath = false,
    stDlPath = false,
    batchDL = false;

// go to work folder
try {
    fs.accessSync(cfg.dir.content, fs.R_OK | fs.W_OK)
}
catch (e) {
    console.log(e);
    console.log(`[ERROR] %s`,e.messsage);
    process.exit();
}
process.chdir(cfg.dir.content);

// select mode
if(argv.auth){
    auth();
}
else if(argv.search){
    searchShow();
}
else if(argv.s && !isNaN(parseInt(argv.s,10)) && parseInt(argv.s,10) > 0){
    getShow();
}
else{
    yargs.showHelp();
    process.exit();
}

// auth
async function auth(){
    let authOpts = {};
    authOpts.user = await shlp.question(`[Q] LOGIN/EMAIL`);
    authOpts.pass = await shlp.question(`[Q] PASSWORD   `);
    let authData =  await getData({
        baseUrl: api_host,
        url: `/auth/login/`,
        useProxy: true,
        auth: authOpts,
    });
    if(authData.ok){
        authData = JSON.parse(authData.res.body);
        if(authData.token){
            console.log(`[INFO] Authentication success, your token: %s%s\n`, authData.token.slice(0,8),'*'.repeat(32));
            fs.writeFileSync(tokenFile,yaml.stringify({"token":authData.token}));
        }
        else if(authData.error){
            console.log(`[ERROR]`,authData.error,`\n`);
            process.exit(1);
        }
    }
}

// search show
async function searchShow(){
    let qs = {unique: true, limit: 100, q: argv.search, offset: (argv.p-1)*1000 };
    let searchData = await getData({
        baseUrl: api_host,
        url: `/source/funimation/search/auto/`,
        querystring: qs,
        useToken: true,
        useProxy: true,
    });
    if(!searchData.ok){return;}
    searchData = JSON.parse(searchData.res.body);
    if(searchData.detail){
        console.log(`[ERROR] ${searchData.detail}`);
        return;
    }
    if(searchData.items && searchData.items.hits){
        let shows = searchData.items.hits;
        console.log(`[INFO] Search Results:`);
        for(let ssn in shows){
            console.log(`[#${shows[ssn].id}] ${shows[ssn].title}` + (shows[ssn].tx_date?` (${shows[ssn].tx_date})`:``));
        }
    }
    console.log(`[INFO] Total shows found: %s\n`,searchData.count);
}

// get show
async function getShow(){
    // show main data
    let showData = await getData({
        baseUrl: api_host,
        url: `/source/catalog/title/${parseInt(argv.s,10)}`,
        useToken: true,
        useProxy: true,
    });
    // check errors
    if(!showData.ok){return;}
    showData = JSON.parse(showData.res.body);
    if(showData.status){
        console.log(`[ERROR] Error #%d: %s\n`, showData.status, showData.data.errors[0].detail);
        process.exit(1);
    }
    else if(!showData.items || showData.items.length<1){
        console.log(`[ERROR] Show not found\n`);
        process.exit(0);
    }
    showData = showData.items[0];
    console.log(`[#%s] %s (%s)`,showData.id,showData.title,showData.releaseYear);
    // show episodes
    let qs = { limit: -1, sort: 'order', sort_direction: 'ASC', title_id: parseInt(argv.s,10) };
    if(argv.alt){ qs.language = `English`; }
    let episodesData = await getData({
        baseUrl: api_host,
        url: `/funimation/episodes/`,
        querystring: qs,
        useToken: true,
        useProxy: true,
    });
    if(!episodesData.ok){return;}
    let eps = JSON.parse(episodesData.res.body).items, fnSlug = [], is_selected = false;
    argv.e = typeof argv.e == 'number' || typeof argv.e == 'string' ? argv.e.toString() : '';
    argv.e = argv.e.match(',') ? argv.e.split(',') : [argv.e];
    let epSelList = argv.e, epSelRanges = [], epSelEps = [];
    epSelList = epSelList.map((e)=>{
        if(e.match('-')){
            e = e.split('-');
            if( e[0].match(/^(?:[A-Z]+|)\d+$/i) && e[1].match(/^\d+$/) ){
                e[0] = e[0].replace(/^(?:([A-Z]+)|)(0+)/i,'$1');
                let letter = e[0].match(/^([A-Z]+)\d+$/i) ? e[0].match(/^([A-Z]+)\d+$/i)[1].toUpperCase() : '';
                e[0] = e[0].replace(/^[A-Z]+(\d+)$/i,'$1');
                e[0] = parseInt(e[0]);
                e[1] = parseInt(e[1]);
                if(e[0] < e[1]){
                    for(let i=e[0];i<e[1]+1;i++){
                        epSelRanges.push(letter+i);
                    }
                    return '';
                }
                else{
                    return (letter+e[0]);
                }
            }
            else{
                return '';
            }
        }
        else if(e.match(/^(?:[A-Z]+|)\d+$/i)){
            return e.replace(/^(?:([A-Z]+)|)(0+)/i,'$1').toUpperCase();
        }
        else{
            return '';
        }
    });
    epSelList = [...new Set(epSelList.concat(epSelRanges))];
    // parse episodes list
    for(let e in eps){
        let showStrId = eps[e].ids.externalShowId;
        let epStrId = eps[e].ids.externalEpisodeId.replace(new RegExp('^'+showStrId),'');
        // select
        if(epSelList.includes(epStrId.replace(/^(?:([A-Z]+)|)(0+)/,'$1'))){
            fnSlug.push({title:eps[e].item.titleSlug,episode:eps[e].item.episodeSlug});
            epSelEps.push(epStrId);
            is_selected = true;
        }
        else{
            is_selected = false;
        }
        // console vars
        let tx_snum = eps[e].item.seasonNum==1?'':` S${eps[e].item.seasonNum}`;
        let tx_type = eps[e].mediaCategory != 'episode' ? eps[e].mediaCategory : ``;
        let tx_enum = eps[e].item.episodeNum !== '' ?
            `#${(eps[e].item.episodeNum < 10 ? '0' : '')+eps[e].item.episodeNum}` : `#`+eps[e].item.episodeId;
        let qua_str = eps[e].quality.height ? eps[e].quality.quality + eps[e].quality.height : `UNK`;
        let aud_str = eps[e].audio.length > 0 ? `, ${eps[e].audio.join(', ')}` : '';
        let rtm_str = eps[e].item.runtime !== '' ? eps[e].item.runtime : '??:??';
        // console string
        let episodeIdStr = epStrId;
        let conOut  = `[${episodeIdStr}] `;
            conOut += `${eps[e].item.titleName+tx_snum} - ${tx_type+tx_enum} ${eps[e].item.episodeName} `;
            conOut += `(${rtm_str}) [${qua_str+aud_str}]`;
            conOut += is_selected ? ' (selected)' : '';
            conOut += eps.length-1 == e ? '\n' : '';
        console.log(conOut);
    }
    if(fnSlug.length>1){
        batchDL = true;
    }
    if(fnSlug.length<1){
        console.log(`[INFO] Episodes not selected!\n`);
        process.exit();
    }
    else{
        console.log(`[INFO] Selected Episodes: %s\n`,epSelEps.join(', '));
        for(let fnEp=0;fnEp<fnSlug.length;fnEp++){
            await getEpisode(fnSlug[fnEp]);
        }
    }
}

async function getEpisode(fnSlug){
    let episodeData = await getData({
        baseUrl: api_host,
        url: `/source/catalog/episode/${fnSlug.title}/${fnSlug.episode}/`,
        useToken: true,
        useProxy: true,
    });
    if(!episodeData.ok){return;}
    let ep = JSON.parse(episodeData.res.body).items[0], streamId = 0;
    // build fn
    fnTitle = argv.t ? argv.t : ep.parent.title;
    ep.number = isNaN(ep.number) ? ep.number : ( parseInt(ep.number, 10) < 10 ? '0' + ep.number : ep.number );
    if(ep.mediaCategory != 'Episode'){
        ep.number = ep.number !== '' ? ep.mediaCategory+ep.number : ep.mediaCategory+'#'+ep.id;
    }
    fnEpNum = argv.ep && !batchDL ? ( parseInt(argv.ep, 10) < 10 ? '0' + argv.ep : argv.ep ) : ep.number;
    // is uncut
    let uncut = {
        Japanese: false,
        English: false
    };
    // end
    console.log(
        `[INFO] %s - S%sE%s - %s`,
        ep.parent.title,
        (ep.parent.seasonNumber?ep.parent.seasonNumber:'?'),
        (ep.number?ep.number:'?'),
        ep.title
    );
    console.log(`[INFO] Available streams (Non-Encrypted):`);
    // map medias
    let media = ep.media.map(function(m){
        if(m.mediaType=='experience'){
            if(m.version.match(/uncut/i)){
                uncut[m.language] = true;
            }
            return {
                id: m.id,
                language: m.language,
                version: m.version,
                type: m.experienceType,
                subtitles: getSubsUrl(m.mediaChildren),
            };
        }
        else{
            return { id: 0, type: '' };
        }
    });
    // select
    media = media.reverse();
    for(let m of media){
        let selected = false;
        if(m.id > 0 && m.type == 'Non-Encrypted'){
            let dub_type = m.language;
            let selUncut = !argv.simul && uncut[dub_type] && m.version.match(/uncut/i) 
                ? true 
                : (!uncut[dub_type] || argv.simul && m.version.match(/simulcast/i) ? true : false);
            if(dub_type == 'Japanese' && argv.sub && selUncut){
                streamId = m.id;
                stDlPath = m.subtitles;
                selected = true;
            }
            else if(dub_type == 'English' && !argv.sub && selUncut){
                streamId = m.id;
                stDlPath = m.subtitles;
                selected = true;
            }
            console.log(`[#${m.id}] ${dub_type} [${m.version}]`,(selected?'(selected)':''));
        }
    }
    if(streamId<1){
        console.log(`[ERROR] Track not selected\n`);
        return;
    }
    else{
        let streamData = await getData({
            baseUrl: api_host,
            url: `/source/catalog/video/${streamId}/signed`,
            useToken: true,
            useProxy: true,
            dinstid: 'uuid',
        });
        if(!streamData.ok){return;}
        streamData = JSON.parse(streamData.res.body);
        tsDlPath = false;
        if(streamData.errors){
            console.log(`[ERROR] Error #%s: %s\n`,streamData.errors[0].code,streamData.errors[0].detail);
            return;
        }
        else{
            for(let u in streamData.items){
                if(streamData.items[u].videoType == 'm3u8'){
                    tsDlPath = streamData.items[u].src;
                    break;
                }
            }
        }
        if(!tsDlPath){
            console.log(`[ERROR] Unknown error\n`);
            return;
        }
        else{
            await downloadStreams();
        }
    }
}

function getSubsUrl(m){
    if(argv.nosubs && !argv.sub){
        return false;
    }
    for(let i in m){
        let fpp = m[i].filePath.split('.');
        let fpe = fpp[fpp.length-1];
        if(fpe == 'dfxp'){ // dfxp, srt, vtt
            return m[i].filePath;
        }
    }
    return false;
}

async function downloadStreams(){
    
    // req playlist
    let plQualityReq = await getData({
        url: tsDlPath,
        useProxy: (argv.ssp ? false : true),
    });
    if(!plQualityReq.ok){return;}
    
    let plQualityLinkList = m3u8(plQualityReq.res.body);
    
    let mainServersList = [
        'd132fumi6di1wa.cloudfront.net',
        'funiprod.akamaized.net'
    ];
    
    let plServerList = [],
        plStreams    = {},
        plLayersStr  = [],
        plLayersRes  = {};
        plMaxLayer   = 1;
    
    for(let s of plQualityLinkList.playlists){
        // set layer and max layer
        let plLayerId = parseInt(s.uri.match(/_Layer(\d+)\.m3u8$/)[1]);
        plMaxLayer    = plMaxLayer < plLayerId ? plLayerId : plMaxLayer;
        // set urls and servers
        let plUrlDl  = s.uri;
        let plServer = plUrlDl.split('/')[2];
        if(!plServerList.includes(plServer)){
            plServerList.push(plServer);
        }
        if(!Object.keys(plStreams).includes(plServer)){
            plStreams[plServer] = {};
        }
        if(plStreams[plServer][plLayerId] && plStreams[plServer][plLayerId] != plUrlDl){
            console.log(`[WARN] Non duplicate url for ${plServer} detected, please report to developer!`);
        }
        else{
            plStreams[plServer][plLayerId] = plUrlDl;
        }
        // set plLayersStr
        let plResolution = `${s.attributes.RESOLUTION.height}p`;
        plLayersRes[plLayerId] = plResolution;
        let plBandwidth  = Math.round(s.attributes.BANDWIDTH/1024);
        if(plLayerId<10){
            plLayerId = plLayerId.toString().padStart(2,' ')
        }
        let qualityStrAdd   = `${plLayerId}: ${plResolution} (${plBandwidth}KiB/s)`;
        let qualityStrRegx  = new RegExp(qualityStrAdd.replace(/(\:|\(|\)|\/)/g,'\\$1'),'m');
        let qualityStrMatch = !plLayersStr.join('\r\n').match(qualityStrRegx);
        if(qualityStrMatch){
            plLayersStr.push(qualityStrAdd);
        }
    }
    
    for(let s of mainServersList){
        if(plServerList.includes(s)){
            plServerList.splice(plServerList.indexOf(s),1);
            plServerList.unshift(s);
            break;
        }
    }
    
    argv.q = argv.q < 1 || argv.q > plMaxLayer ? plMaxLayer : argv.q;
    
    let plSelectedServer = plServerList[argv.x-1];
    let plSelectedList   = plStreams[plSelectedServer];
    let videoUrl = argv.x < plServerList.length+1 && plSelectedList[argv.q] ? plSelectedList[argv.q] : '';
    
    plLayersStr.sort();
    console.log(`[INFO] Servers available:\n\t${plServerList.join('\n\t')}`);
    console.log(`[INFO] Available qualities:\n\t${plLayersStr.join('\n\t')}`);
    
    if(videoUrl != ''){
        console.log(`[INFO] Selected layer: ${argv.q} (${plLayersRes[argv.q]}) @ ${plSelectedServer}`);
        console.log(`[INFO] Stream URL:`,videoUrl);
        fnSuffix = argv.suffix.replace('SIZEp',plLayersRes[argv.q]);
        fnOutput = shlp.cleanupFilename(`[${argv.a}] ${fnTitle} - ${fnEpNum} [${fnSuffix}]`);
        console.log(`[INFO] Output filename: ${fnOutput}`);
    }
    else if(argv.x > plServerList.length){
        console.log(`[ERROR] Server not selected!\n`);
        return;
    }
    else{
        console.log(`[ERROR] Layer not selected!\n`);
        return;
    }
    
    if (!argv.novids) {
        // download video
        let reqVideo = await getData({
            url: videoUrl,
            useProxy: (argv.ssp ? false : true),
        });
        if (!reqVideo.ok) { return; }
        
        let chunkList = m3u8(reqVideo.res.body);
        chunkList.baseUrl = videoUrl.split('/').slice(0, -1).join('/') + '/';
        
        let proxyHLS = false;
        if (argv.proxy && !argv.ssp) {
            try {
                proxyHLS = {};
                proxyHLS.url = buildProxyUrl(argv.proxy,argv['proxy-auth']);
            }
            catch(e){
                console.log(`\n[WARN] Not valid proxy URL${e.input?' ('+e.input+')':''}!`);
                console.log(`[WARN] Skiping...`);
                proxyHLS = false;
            }
        }
        let dldata = await streamdl({
            fn: fnOutput,
            m3u8json: chunkList,
            baseurl: chunkList.baseUrl,
            pcount: 10,
            proxy: (proxyHLS ? proxyHLS : false)
        });
        if (!dldata.ok) {
            console.log(`[ERROR] ${dldata.error}\n`);
            return;
        }
        else {
            console.log(`[INFO] Video downloaded!\n`);
        }
    }
    else{
        console.log(`[INFO] Skip video downloading...\n`);
    }
    
    // download subtitles
    if(stDlPath){
        console.log(`[INFO] Downloading subtitles...`);
        console.log(stDlPath);
        let subsSrc = await getData({
            url: stDlPath,
            useProxy: true,
        });
        if(subsSrc.ok){
            let srtData = ttml2srt(subsSrc.res.body);
            fs.writeFileSync(`${fnOutput}.srt`,srtData);
            console.log(`[INFO] Subtitles downloaded!`);
        }
        else{
            console.log(`[ERROR] Failed to download subtitles!`);
            argv.mks = false;
        }
    }
    
    if(!isFile(`${fnOutput}.ts`)){
        console.log(`\n[INFO] TS file not found, skip muxing video...\n`);
        return;
    }
    
    // add subs
    let addSubs = argv.mks && stDlPath ? true : false;
    
    if( !argv.mp4 && !isFile(cfg.bin.mkvmerge) && !isFile(cfg.bin.mkvmerge+`.exe`) ){
        console.log(`\n[WARN] MKVMerge not found, skip using this...`);
        cfg.bin.mkvmerge = false;
    }
    if( !isFile(cfg.bin.ffmpeg) && !isFile(cfg.bin.ffmpeg+`.exe`) ){
        console.log((cfg.bin.mkvmerge?`\n`:``)+`[WARN] FFmpeg not found, skip using this...`);
        cfg.bin.ffmpeg = false;
    }
    
    // select muxer
    if(!argv.mp4 && cfg.bin.mkvmerge){
        // mux to mkv
        let mkvmux  = `-o "${fnOutput}.mkv" --disable-track-statistics-tags --engage no_variable_data `;
            mkvmux += `--track-name "0:${argv.a}" --language "1:${argv.sub?'jpn':'eng'}" --video-tracks 0 --audio-tracks 1 --no-subtitles --no-attachments `;
            mkvmux += `"${fnOutput}.ts" `;
            mkvmux += addSubs ? `--language 0:eng "${fnOutput}.srt" ` : ``;
        shlp.exec(`mkvmerge`,`"${cfg.bin.mkvmerge}"`,mkvmux);
    }
    else if(cfg.bin.ffmpeg){
        let ffext = !argv.mp4 ? `mkv` : `mp4`;
        let ffmux = `-i "${fnOutput}.ts" `
            ffmux += addSubs ? `-i "${fnOutput}.srt" ` : ``;
            ffmux += `-map 0 -c:v copy -c:a copy `
            ffmux += addSubs ? `-map 1 ` : ``;
            ffmux += addSubs && !argv.mp4 ? `-c:s srt ` : ``;
            ffmux += addSubs &&  argv.mp4 ? `-c:s mov_text ` : ``;
            ffmux += `-metadata encoding_tool="no_variable_data" `;
            ffmux += `-metadata:s:v:0 title="[${argv.a}]" -metadata:s:a:0 language=${argv.sub?'jpn':'eng'} `;
            ffmux += addSubs ? `-metadata:s:s:0 language=eng ` : ``;
            ffmux += `"${fnOutput}.${ffext}"`;
        // mux to mkv
        shlp.exec(`ffmpeg`,`"${cfg.bin.ffmpeg}"`,ffmux);
    }
    else{
        console.log(`\n[INFO] Done!\n`);
        return;
    }
    if(argv.nocleanup){
        fs.renameSync(fnOutput+`.ts`, path.join(cfg.dir.trash,`/${fnOutput}.ts`));
        if(stDlPath && argv.mks){
            fs.renameSync(fnOutput+`.srt`, path.join(cfg.dir.trash,`/${fnOutput}.srt`));
        }
    }
    else{
        fs.unlinkSync(fnOutput+`.ts`, path.join(cfg.dir.trash,`/${fnOutput}.ts`));
        if(stDlPath && argv.mks){
            fs.unlinkSync(fnOutput+`.srt`, path.join(cfg.dir.trash,`/${fnOutput}.srt`));
        }
    }
    console.log(`\n[INFO] Done!\n`);
}

function isFile(file){
    try{
        const isFile = fs.statSync(file).isFile();
        return isFile;
    }
    catch(e){
        return false;
    }
}

// get data from url
async function getData(options){
    let gOptions = { url: options.url, headers: {} };
    if(options.baseUrl){
        gOptions.baseUrl = options.baseUrl;
    }
    if(options.querystring){
        gOptions.url += `?${new URLSearchParams(options.querystring).toString()}`;
    }
    if(options.auth){
        gOptions.method = 'POST';
        gOptions.body = new FormData();
        gOptions.body.append('username', options.auth.user);
        gOptions.body.append('password', options.auth.pass);
    }
    if(options.useToken && token){
        gOptions.headers.Authorization = `Token ${token}`;
    }
    if(options.dinstid){
        gOptions.headers.devicetype = 'Android Phone';
    }
    if(options.useProxy && argv.proxy){
        try{
            let proxyUrl = buildProxyUrl(argv.proxy,argv['proxy-auth']);
            gOptions.agent = new ProxyAgent(proxyUrl);
            gOptions.timeout = 10000;
        }
        catch(e){
            console.log(`\n[WARN] Not valid proxy URL${e.input?' ('+e.input+')':''}!`);
            console.log(`[WARN] Skiping...`);
            argv.proxy = false;
        }
    }
    try {
        let res = await got(gOptions);
        return {
            ok: true,
            res,
        };
    }
    catch(error){
        if(error.statusCode && error.statusMessage){
            if(error.body.match(/^\{/)){
                let res = error;
                return {
                    ok: true,
                    res,
                };
            }
            else{
                console.log(`\n[ERROR] ${error.name} ${error.statusCode}: ${error.statusMessage}\n`);
            }
        }
        else{
            console.log(`\n[ERROR] ${error.name}: ${error.code}\n`);
        }
        return {
            ok: false,
            error,
        };
    }
}
function buildProxyUrl(proxyBaseUrl,proxyAuth){
    let proxyCfg = new URL(proxyBaseUrl);
    if(!proxyCfg.hostname || !proxyCfg.port){
        throw new Error();
    }
    if(proxyAuth && proxyAuth.match(':')){
        proxyCfg.auth = proxyAuth;
    }
    return url.format({
        protocol: proxyCfg.protocol,
        slashes: true,
        auth: proxyCfg.auth,
        hostname: proxyCfg.hostname,
        port: proxyCfg.port,
    });
}
