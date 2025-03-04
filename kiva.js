const fs = require('fs').promises;
const axios = require('axios');
const Table = require('cli-table');

let proxyList = [];

const previousBalances = {};

const loadTokens = async () => {
    try {
        const data = await fs.readFile('token.txt', 'utf8');
        return data.trim().split('\n').map(token => token.trim());
    } catch (error) {
        console.error('Error loading tokens from token.txt:', error.message);
        process.exit(1);
    }
};

const loadProxies = async () => {
    try {
        const data = await fs.readFile('proxies.txt', 'utf8');
        proxyList = data.trim().split('\n').map(proxy => proxy.trim());
        console.log(`Loaded ${proxyList.length} proxies from proxies.txt`);
    } catch (error) {
        console.error('Error loading proxies from proxies.txt:', error.message);
        process.exit(1);
    }
};

const getHeaders = (token) => ({
    'authority': 'app.kivanet.com',
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.6',
    'authorization': `Bearer ${token}`,
    'content-type': 'application/json',
    'language': 'en',
    'origin': 'https://app.kivanet.com',
    'referer': 'https://app.kivanet.com/',
    'sec-ch-ua': '"Not(A:Brand";v="99", "Brave";v="133", "Chromium";v="133"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'sec-gpc': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
});

const createAxiosInstance = (proxy) => {
    if (!proxy) return axios.create();

    const [protocol, rest] = proxy.split('://');
    const [auth, hostPort] = rest.split('@');
    const [username, password] = auth.split(':');
    const [host, port] = hostPort.split(':');

    const proxyConfig = {
        host,
        port: parseInt(port),
        auth: { username, password },
        protocol
    };

    return axios.create({
        proxy: proxyConfig
    });
};

const fetchWithProxyRotation = async (url, options, proxies, retries = 0) => {
    if (retries >= proxies.length) throw new Error('All proxies failed');
    const proxy = proxies[retries];
    const instance = createAxiosInstance(proxy);
    try {
        const response = await instance.get(url, options);
        return { data: response.data, proxy };
    } catch (error) {
        console.error(`Proxy ${proxy} failed: ${error.message}`);
        return fetchWithProxyRotation(url, options, proxies, retries + 1);
    }
};

function calculateMiningTime(signTime, nowTime) {
    const timeDiffMs = nowTime - signTime;
    const timeDiffSec = timeDiffMs / 1000;
    const hours = Math.floor(timeDiffSec / 3600);
    const minutes = Math.floor((timeDiffSec % 3600) / 60);
    const seconds = Math.floor(timeDiffSec % 60);
    return `${hours}h ${minutes}m ${seconds}s`;
}

async function getUserInfo(token, proxy) {
    const result = await fetchWithProxyRotation('https://app.kivanet.com/api/user/getUserInfo', { headers: getHeaders(token) }, proxyList);
    return { data: result.data.object, proxy: result.proxy };
}

async function getMyAccountInfo(token, proxy) {
    const result = await fetchWithProxyRotation('https://app.kivanet.com/api/user/getMyAccountInfo', { headers: getHeaders(token) }, proxyList);
    return { data: result.data.object, proxy: result.proxy };
}

async function getSignInfo(token, proxy) {
    const result = await fetchWithProxyRotation('https://app.kivanet.com/api/user/getSignInfo', { headers: getHeaders(token) }, proxyList);
    return { data: result.data.object, proxy: result.proxy };
}

function displayStats(accountsData) {
    console.clear();

    const table = new Table({
        head: ['ID', 'Nickname', 'Balance', 'Mining Time', 'Proxy', 'Status'],
        colWidths: [10, 15, 15, 15, 30, 15]
    });

    accountsData.forEach(account => {
        table.push([
            account.id || 'N/A',
            account.nickname || 'N/A',
            account.balance || 'N/A',
            account.miningTime || 'N/A',
            account.proxy || 'N/A',
            account.status || 'N/A'
        ]);
    });

    console.log(table.toString());

    console.log('\n=== Mining Progress ===');
    accountsData.forEach(account => {
        if (account.id && account.balance) {
            const currentBalance = parseFloat(account.balance.split(' ')[0]);
            const prevBalance = previousBalances[account.id] || currentBalance;
            const increment = currentBalance - prevBalance;
            previousBalances[account.id] = currentBalance;

            console.log(`ID: ${account.id} | Nickname: ${account.nickname} | Mining Increment: ${increment >= 0 ? '+' : ''}${increment.toFixed(4)} Kiva`);
        }
    });
    console.log('====================\n');
}

async function processAccount(token, accountIndex) {
    let currentProxy = proxyList[0];
    const stats = { id: null, nickname: null, balance: null, miningTime: null, proxy: currentProxy, status: 'Running' };

    try {
        const userInfo = await getUserInfo(token, currentProxy);
        stats.id = userInfo.data.id;
        stats.nickname = userInfo.data.nickName;
        currentProxy = userInfo.proxy;

        const accountInfo = await getMyAccountInfo(token, currentProxy);
        stats.balance = `${accountInfo.data.balance} Kiva`;
        currentProxy = accountInfo.proxy;

        const signInfo = await getSignInfo(token, currentProxy);
        stats.miningTime = calculateMiningTime(parseInt(signInfo.data.signTime), parseInt(signInfo.data.nowTime));
        stats.proxy = signInfo.proxy;

    } catch (error) {
        stats.status = `Error: ${error.message}`;
    }

    return stats;
}

async function runBot() {
    await loadProxies();
    const tokens = await loadTokens();
    console.log(`Loaded ${tokens.length} tokens from token.txt`);

    setInterval(async () => {
        const promises = tokens.map((token, index) => processAccount(token, index));
        const results = await Promise.all(promises);
        displayStats(results);
    }, 60 * 1000);
}

runBot().catch(console.error);