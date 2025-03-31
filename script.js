// UI Elements
const connectButton = document.getElementById('connectButton');
const transferButton = document.getElementById('transferButton');
const statusText = document.getElementById('statusText');
const balanceText = document.getElementById('balanceText');

// API Configuration
const API_BASE_URL = 'https://your-glitch-project-name.glitch.me'; // Replace with your Glitch project URL

// State
let walletAddress = null;

// Connect to wallet
async function connectWallet() {
    try {
        if (!window.solana || !window.solana.isPhantom) {
            alert('Please install Phantom wallet!');
            return;
        }

        const response = await window.solana.connect();
        walletAddress = response.publicKey.toString();
        
        // Update UI
        connectButton.textContent = 'Connected';
        connectButton.disabled = true;
        statusText.textContent = `Connected: ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
        
        // Get balance from server
        const balanceResponse = await fetch(`${API_BASE_URL}/api/connect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ publicKey: walletAddress })
        });
        
        const balanceData = await balanceResponse.json();
        if (balanceData.success) {
            updateBalanceDisplay(balanceData.balance);
        } else {
            throw new Error(balanceData.error);
        }
        
        // Enable transfer button
        transferButton.disabled = false;
    } catch (error) {
        console.error('Error connecting wallet:', error);
        alert('Error connecting wallet: ' + error.message);
    }
}

// Transfer tokens
async function transferTokens() {
    try {
        if (!walletAddress) {
            alert('Please connect your wallet first!');
            return;
        }

        transferButton.disabled = true;
        transferButton.textContent = 'Transferring...';

        // Call server endpoint to transfer tokens
        const response = await fetch(`${API_BASE_URL}/api/transfer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ publicKey: walletAddress })
        });

        const result = await response.json();
        
        if (result.success) {
            alert('Transfer successful!');
            // Refresh balance
            const balanceResponse = await fetch(`${API_BASE_URL}/api/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ publicKey: walletAddress })
            });
            
            const balanceData = await balanceResponse.json();
            if (balanceData.success) {
                updateBalanceDisplay(balanceData.balance);
            }
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error transferring tokens:', error);
        alert('Error transferring tokens: ' + error.message);
    } finally {
        transferButton.disabled = false;
        transferButton.textContent = 'Transfer All';
    }
}

// Update balance display
function updateBalanceDisplay(balanceData) {
    let balanceText = `SOL: ${balanceData.sol.toFixed(4)}`;
    if (balanceData.tokens.length > 0) {
        balanceText += '\nTokens:';
        balanceData.tokens.forEach(token => {
            balanceText += `\n${token.mint.slice(0, 4)}...${token.mint.slice(-4)}: ${token.amount}`;
        });
    }
    document.getElementById('balanceText').textContent = balanceText;
}

// Event Listeners
connectButton.addEventListener('click', connectWallet);
transferButton.addEventListener('click', transferTokens);

// Initialize
transferButton.disabled = true;