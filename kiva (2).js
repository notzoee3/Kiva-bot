const fs = require('fs').promises;
const axios = require('axios');
const Table = require('cli-table');

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

const getHeaders = (token) => ({
    'authority': 'app.kivanet.com',
    'accept': '*/*',
    'authorization': `Bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
});

async function getUserInfo(token) {
    const response = await axios.get('https://app.kivanet.com/api/user/getUserInfo', { headers: getHeaders(token) });
    return response.data.object;
}

async function getMyAccountInfo(token) {
    const response = await axios.get('https://app.kivanet.com/api/user/getMyAccountInfo', { headers: getHeaders(token) });
    return response.data.object;
}

async function getSignInfo(token) {
    const response = await axios.get('https://app.kivanet.com/api/user/getSignInfo', { headers: getHeaders(token) });
    return response.data.object;
}

function calculateMiningTime(signTime, nowTime) {
    const timeDiffSec = (nowTime - signTime) / 1000;
    const hours = Math.floor(timeDiffSec / 3600);
    const minutes = Math.floor((timeDiffSec % 3600) / 60);
    const seconds = Math.floor(timeDiffSec % 60);
    return `${hours}h ${minutes}m ${seconds}s`;
}

function displayStats(accountsData) {
    console.clear();
    const table = new Table({
        head: ['ID', 'Nickname', 'Balance', 'Mining Time', 'Status'],
        colWidths: [10, 15, 15, 15, 15]
    });

    accountsData.forEach(account => {
        table.push([
            account.id || 'N/A',
            account.nickname || 'N/A',
            account.balance || 'N/A',
            account.miningTime || 'N/A',
            account.status || 'N/A'
        ]);
    });
    console.log(table.toString());
}

async function processAccount(token) {
    const stats = { id: null, nickname: null, balance: null, miningTime: null, status: 'Running' };
    try {
        const userInfo = await getUserInfo(token);
        stats.id = userInfo.id;
        stats.nickname = userInfo.nickName;
        
        const accountInfo = await getMyAccountInfo(token);
        stats.balance = `${accountInfo.balance} Kiva`;
        
        const signInfo = await getSignInfo(token);
        stats.miningTime = calculateMiningTime(parseInt(signInfo.signTime), parseInt(signInfo.nowTime));
    } catch (error) {
        stats.status = `Error: ${error.message}`;
    }
    return stats;
}

async function runBot() {
    const tokens = await loadTokens();
    console.log(`Loaded ${tokens.length} tokens from token.txt`);

    setInterval(async () => {
        const promises = tokens.map(token => processAccount(token));
        const results = await Promise.all(promises);
        displayStats(results);
    }, 60 * 1000);
}

runBot().catch(console.error);
