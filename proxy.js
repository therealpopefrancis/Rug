const { HttpsProxyAgent } = require('https-proxy-agent');
const { Connection } = require('@solana/web3.js');

const PROXY_URL = 'https://spr8tvneyy:lRkIpsu8tg282vWB_k@gate.smartproxy.com:10001';

async function setupProxy() {
    try {
        // Create proxy agent
        const proxyAgent = new HttpsProxyAgent(PROXY_URL);

        // Create Solana connection with proxy
        const connection = new Connection(
            'https://api.mainnet-beta.solana.com',
            {
                httpAgent: proxyAgent,
                commitment: 'confirmed'
            }
        );

        // Test connection
        const version = await connection.getVersion();
        console.log('Proxy connection successful, Solana version:', version);

        return connection;
    } catch (error) {
        console.error('Failed to setup proxy:', error);
        throw error;
    }
}

module.exports = {
    setupProxy
};