# Funimation Downloader NX

Funimation Downloader NX is capable of downloading videos from the *Funimation* streaming service.

## Legal Warning

This application is not endorsed by or affiliated with *Funimation*. This application enables you to download videos for offline viewing which may be forbidden by law in your country. The usage of this application may also cause a violation of the *Terms of Service* between you and the stream provider. This tool is not responsible for your actions; please make an informed decision before using this application.

## Prerequisites

* NodeJS >= 12.4.0 (https://nodejs.org/)
* NPM >= 6.9.0 (https://www.npmjs.org/)
* ffmpeg >= 4.0.0 (https://www.videohelp.com/software/ffmpeg)
* MKVToolNix >= 20.0.0 (https://www.videohelp.com/software/MKVToolNix)

### Paths Configuration

By default this application uses the following paths to programs (main executables):
* `./modules/mkvtoolnix/mkvmerge`
* `./modules/ffmpeg`

To change these paths you need to edit `config.main.yml` in `./modules/` directory.

### Node Modules

After installing NodeJS with NPM go to directory with `package.json` file and type: `npm i`.
* [check dependencies](https://david-dm.org/seiya-dev/funimation-downloader-nx)

## CLI Options

### Authentication

* `--auth` enter auth mode

### Get Show ID

* `--search <s>` sets the show title for search

### Download Video

* `-s <i> -e <s>` sets the show id and episode ids (comma-separated, hyphen-sequence)
* `-q <i>` sets the video layer quality [1...10] (optional, 0 is max)
* `--alt` alternative episode listing (if available)
* `--sub` switch from English dub to Japanese dub with subtitles
* `--simul` force select simulcast version instead of uncut version
* `-x` select server
* `--novids` skip download videos  (for downloading subtitles only)
* `--nosubs` skip download subtitles for Dub (if available)

### Proxy

* `--proxy <s>` http(s)/socks proxy WHATWG url (ex. https://myproxyhost:1080)
* `--proxy-auth <s>` Colon-separated username and password for proxy
* `--ssp` don't use proxy for stream downloading

### Muxing

`[note] this application mux into mkv by default`
* `--mp4` mux into mp4
* `--mks` add subtitles to mkv or mp4 (if available)

### Filenaming (optional)

* `-a <s>` release group ("Funimation" by default)
* `-t <s>` show title override
* `--ep <s>` episode number override (ignored in batch mode)
* `--suffix <s>` filename suffix override (first "SIZEp" will be replaced with actual video size, "SIZEp" by default)

### Utility

* `--nocleanup` move unnecessary files to trash folder after completion instead of deleting
* `-h`, `--help` show all options

## Filename Template

[`release group`] `title` - `episode` [`suffix`].`extension`

## CLI Examples

* `node funi --search "My Hero"` search "My Hero" in title
* `node funi -s 124389 -e 1,2,3` download episodes 1-3 from show with id 124389
* `node funi -s 124389 -e 1-3,2-7,s1-2` download episodes 1-7 and "S"-episodes 1-2 from show with id 124389
