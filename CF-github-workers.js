'use strict'

// 前缀，如果自定义路由为example.com/gh/*，将PREFIX改为 '/gh/'，注意，少一个杠都会错！
const PREFIX = '/'
// 分支文件使用jsDelivr镜像的开关，0为关闭，默认关闭
const Config = {
    jsdelivr: 0
}

const whiteList = [] // 白名单，路径里面有包含字符的才会通过，e.g. ['/username/']

/** @type {ResponseInit} */
const PREFLIGHT_INIT = {
    status: 204,
    headers: new Headers({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-max-age': '1728000',
    }),
}

const exp1 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i
const exp2 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i
const exp3 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i
const exp4 = /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i
const exp5 = /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i
const exp6 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i

/**
 * @param {any} body
 * @param {number} status
 * @param {Object<string, string>} headers
 */
function makeRes(body, status = 200, headers = {}) {
    headers['access-control-allow-origin'] = '*'
    return new Response(body, {status, headers})
}

/**
 * @param {string} urlStr
 */
function newUrl(urlStr) {
    try {
        return new URL(urlStr)
    } catch (err) {
        return null
    }
}

addEventListener('fetch', e => {
    const ret = fetchHandler(e)
        .catch(err => makeRes('cfworker error:\n' + err.stack, 502))
    e.respondWith(ret)
})

function checkUrl(u) {
    for (let i of [exp1, exp2, exp3, exp4, exp5, exp6]) {
        if (u.search(i) === 0) {
            return true
        }
    }
    return false
}

/**
 * @param {FetchEvent} e
 */
async function fetchHandler(e) {
    const req = e.request
    const urlStr = req.url
    const urlObj = new URL(urlStr)
    let path = urlObj.searchParams.get('q')
    
    // 如果是根路径，返回美化后的前端页面
    if (urlObj.pathname === PREFIX || urlObj.pathname === PREFIX + 'index.html') {
        return new Response(FRONTEND_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
    }
    
    if (path) {
        return Response.redirect('https://' + urlObj.host + PREFIX + path, 301)
    }
    // cfworker 会把路径中的 `//` 合并成 `/`
    path = urlObj.href.substr(urlObj.origin.length + PREFIX.length).replace(/^https?:\/+/, 'https://')
    if (path.search(exp1) === 0 || path.search(exp5) === 0 || path.search(exp6) === 0 || path.search(exp3) === 0 || path.search(exp4) === 0) {
        return httpHandler(req, path)
    } else if (path.search(exp2) === 0) {
        if (Config.jsdelivr) {
            const newUrl = path.replace('/blob/', '@').replace(/^(?:https?:\/\/)?github\.com/, 'https://cdn.jsdelivr.net/gh')
            return Response.redirect(newUrl, 302)
        } else {
            path = path.replace('/blob/', '/raw/')
            return httpHandler(req, path)
        }
    } else if (path.search(exp4) === 0) {
        const newUrl = path.replace(/(?<=com\/.+?\/.+?)\/(.+?\/)/, '@$1').replace(/^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com/, 'https://cdn.jsdelivr.net/gh')
        return Response.redirect(newUrl, 302)
    } else {
        // 移除对外部静态文件的依赖，返回自定义404页面
        return new Response(NOT_FOUND_HTML, {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
    }
}

/**
 * @param {Request} req
 * @param {string} pathname
 */
function httpHandler(req, pathname) {
    const reqHdrRaw = req.headers

    // preflight
    if (req.method === 'OPTIONS' &&
        reqHdrRaw.has('access-control-request-headers')
    ) {
        return new Response(null, PREFLIGHT_INIT)
    }

    const reqHdrNew = new Headers(reqHdrRaw)

    let urlStr = pathname
    let flag = !Boolean(whiteList.length)
    for (let i of whiteList) {
        if (urlStr.includes(i)) {
            flag = true
            break
        }
    }
    if (!flag) {
        return new Response("blocked", {status: 403})
    }
    if (urlStr.search(/^https?:\/\//) !== 0) {
        urlStr = 'https://' + urlStr
    }
    const urlObj = newUrl(urlStr)

    /** @type {RequestInit} */
    const reqInit = {
        method: req.method,
        headers: reqHdrNew,
        redirect: 'manual',
        body: req.body
    }
    return proxy(urlObj, reqInit)
}

/**
 *
 * @param {URL} urlObj
 * @param {RequestInit} reqInit
 */
async function proxy(urlObj, reqInit) {
    const res = await fetch(urlObj.href, reqInit)
    const resHdrOld = res.headers
    const resHdrNew = new Headers(resHdrOld)

    const status = res.status

    if (resHdrNew.has('location')) {
        let _location = resHdrNew.get('location')
        if (checkUrl(_location))
            resHdrNew.set('location', PREFIX + _location)
        else {
            reqInit.redirect = 'follow'
            return proxy(newUrl(_location), reqInit)
        }
    }
    resHdrNew.set('access-control-expose-headers', '*')
    resHdrNew.set('access-control-allow-origin', '*')

    resHdrNew.delete('content-security-policy')
    resHdrNew.delete('content-security-policy-report-only')
    resHdrNew.delete('clear-site-data')

    return new Response(res.body, {
        status,
        headers: resHdrNew,
    })
}

// 404页面 HTML
const NOT_FOUND_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>页面未找到 - GitHub 加速代理</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 98 96'><path fill='%234299e1' d='M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z'/></svg>">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 50%, #90caf9 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #2c3e50;
            text-align: center;
            padding: 20px;
        }
        .error-container {
            background: rgba(255, 255, 255, 0.9);
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            max-width: 500px;
        }
        h1 {
            color: #e74c3c;
            margin-bottom: 20px;
        }
        p {
            margin-bottom: 20px;
            line-height: 1.6;
        }
        .home-link {
            display: inline-block;
            background: linear-gradient(135deg, #4facfe, #00f2fe);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            transition: all 0.3s ease;
        }
        .home-link:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(79, 172, 254, 0.3);
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>404 - 页面未找到</h1>
        <p>抱歉，您访问的页面不存在。</p>
        <p>请返回首页使用 GitHub 加速代理服务。</p>
        <a href="/" class="home-link">返回首页</a>
    </div>
</body>
</html>
`;

// 美化后的前端页面 HTML - 浅色背景版本
const FRONTEND_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub 加速代理</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 98 96'><path fill='%234299e1' d='M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z'/></svg>">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 50%, #90caf9 100%);
            min-height: 100vh;
            color: #2c3e50;
            line-height: 1.6;
        }

        .minimal-layout {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            padding: 0;
        }

        .header {
            padding: 80px 40px 60px;
            text-align: center;
        }

        .header h1 {
            font-size: 3.5em;
            font-weight: 800;
            margin-bottom: 20px;
            background: linear-gradient(135deg, #2c3e50, #3498db);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .header p {
            font-size: 1.3em;
            color: #34495e;
            font-weight: 400;
            max-width: 500px;
            margin: 0 auto;
            opacity: 0.9;
        }

        .main-content {
            flex: 1;
            padding: 0 40px 60px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 50px;
        }

        .input-section {
            width: 100%;
            max-width: 800px;
        }

        .url-input {
            width: 100%;
            padding: 20px 25px;
            border: 2px solid rgba(255, 255, 255, 0.8);
            border-radius: 12px;
            font-size: 16px;
            background: rgba(255, 255, 255, 0.9);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
            transition: all 0.3s ease;
            font-family: 'SF Mono', Monaco, monospace;
            color: #2d3748;
            margin-bottom: 20px;
        }

        .url-input:focus {
            outline: none;
            transform: translateY(-2px);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
            background: white;
            border-color: #3498db;
        }

        .url-input::placeholder {
            color: #7f8c8d;
        }

        .btn {
            width: 100%;
            background: linear-gradient(135deg, #4facfe, #00f2fe);
            color: white;
            border: none;
            padding: 20px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 8px 24px rgba(79, 172, 254, 0.3);
        }

        .btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 12px 32px rgba(79, 172, 254, 0.4);
        }

        .examples-section {
            width: 100%;
            max-width: 800px;
            text-align: center;
        }

        .examples-section h3 {
            font-size: 1.5em;
            margin-bottom: 30px;
            font-weight: 600;
            color: #2c3e50;
        }

        .examples-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 20px;
        }

        .example-item {
            text-align: left;
            padding: 0;
        }

        .example-item code {
            background: rgba(255, 255, 255, 0.7);
            color: #2c3e50;
            padding: 12px 16px;
            border-radius: 8px;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 0.9em;
            display: block;
            margin-bottom: 8px;
            word-break: break-all;
            border: 1px solid rgba(255, 255, 255, 0.5);
            backdrop-filter: blur(10px);
        }

        .example-desc {
            color: #7f8c8d;
            font-size: 0.9em;
            font-style: italic;
            padding-left: 5px;
        }

        .footer {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.3);
            color: #7f8c8d;
            font-size: 0.9em;
            border-top: 1px solid rgba(255, 255, 255, 0.5);
        }

        @media (max-width: 768px) {
            .header {
                padding: 60px 20px 40px;
            }
            
            .header h1 {
                font-size: 2.5em;
            }
            
            .header p {
                font-size: 1.1em;
            }
            
            .main-content {
                padding: 0 20px 40px;
                gap: 40px;
            }
            
            .url-input {
                padding: 18px 20px;
            }
            
            .btn {
                padding: 18px;
            }
            
            .examples-grid {
                grid-template-columns: 1fr;
                gap: 15px;
            }
            
            .example-item code {
                font-size: 0.85em;
                padding: 10px 14px;
            }
        }

        @media (max-width: 480px) {
            .header h1 {
                font-size: 2em;
            }
            
            .examples-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="minimal-layout">
        <div class="header">
            <h1>GitHub 加速代理</h1>
            <p>快速访问 GitHub 资源，解决网络连接问题</p>
        </div>

        <div class="main-content">
            <div class="input-section">
                <input type="text" id="githubUrl" class="url-input" 
                       placeholder="输入完整的 GitHub 文件链接"
                       onkeypress="handleKeyPress(event)">
                <button class="btn" onclick="proxyFile()">
                    加速访问
                </button>
            </div>

            <div class="examples-section">
                <h3>支持的类型示例</h3>
                <div class="examples-grid">
                    <div class="example-item">
                        <code>https://github.com/username/project/archive/master.zip</code>
                        <div class="example-desc">分支源码</div>
                    </div>
                    <div class="example-item">
                        <code>https://github.com/username/project/archive/v0.1.0.tar.gz</code>
                        <div class="example-desc">release源码</div>
                    </div>
                    <div class="example-item">
                        <code>https://github.com/username/project/releases/download/v0.1.0/example.zip</code>
                        <div class="example-desc">release文件</div>
                    </div>
                    <div class="example-item">
                        <code>https://github.com/username/project/blob/master/filename</code>
                        <div class="example-desc">分支文件</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>© 2024 GitHub Proxy Service | Powered by Cloudflare Workers</p>
        </div>
    </div>

    <script>
        function handleKeyPress(event) {
            if (event.key === 'Enter') {
                proxyFile();
            }
        }

        function proxyFile() {
            const input = document.getElementById('githubUrl');
            let url = input.value.trim();
            
            if (!url) {
                alert('请输入 GitHub 资源链接');
                return;
            }

            // 基本的 URL 验证和处理
            if (!url.startsWith('http')) {
                url = 'https://' + url;
            }

            try {
                // 验证 URL 格式
                new URL(url);
                
                // 直接使用完整的 GitHub URL 作为路径，不编码
                const proxyUrl = window.location.origin + '/' + url;
                window.open(proxyUrl, '_blank');
            } catch (error) {
                alert('请输入有效的 URL 地址');
                console.error('URL 解析错误:', error);
            }
        }

        // 为输入框添加回车键监听
        document.getElementById('githubUrl').addEventListener('keypress', handleKeyPress);

        // 页面加载时聚焦输入框
        window.addEventListener('load', function() {
            document.getElementById('githubUrl').focus();
        });
    </script>
</body>
</html>
`;
