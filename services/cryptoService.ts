
import { CryptoNetwork, CryptoTransaction, CryptoTokenBalance, CryptoWalletProfile } from "../types";

// User provided keys
const ETHERSCAN_API_KEY = "9EX19PT36KMWQ19BHZ2UI8J5EBZ1TAF86G";
const TRONSCAN_API_KEY = "5d871c13-d15e-4be2-a37e-7cc6763e3e1c"; 

// Configuration Map for all EVM-based networks
// This ensures they all pass through the same Ethereum logic (fetchEvmData)
const EVM_NETWORKS: Record<string, { baseUrl: string; apiKey?: string; nativeSymbol: string; name: string; priceKey: string }> = {
    ETH: { 
        baseUrl: 'https://api.etherscan.io/api', 
        apiKey: ETHERSCAN_API_KEY, 
        nativeSymbol: 'ETH', 
        name: 'Ethereum', 
        priceKey: 'ETH' 
    },
    BSC: { 
        baseUrl: 'https://api.bscscan.com/api', 
        apiKey: '', // Add BSC API Key here if available
        nativeSymbol: 'BNB', 
        name: 'Binance Smart Chain', 
        priceKey: 'BNB' 
    },
    POLYGON: { 
        baseUrl: 'https://api.polygonscan.com/api', 
        apiKey: '', 
        nativeSymbol: 'MATIC', 
        name: 'Polygon', 
        priceKey: 'MATIC' 
    },
    ARB: { 
        baseUrl: 'https://api.arbiscan.io/api', 
        apiKey: '', 
        nativeSymbol: 'ETH', 
        name: 'Arbitrum One', 
        priceKey: 'ETH' 
    },
    OP: { 
        baseUrl: 'https://api-optimistic.etherscan.io/api', 
        apiKey: '', 
        nativeSymbol: 'ETH', 
        name: 'Optimism', 
        priceKey: 'ETH' 
    },
    BASE: { 
        baseUrl: 'https://api.basescan.org/api', 
        apiKey: '', 
        nativeSymbol: 'ETH', 
        name: 'Base', 
        priceKey: 'ETH' 
    },
    AVAX: { 
        baseUrl: 'https://api.snowtrace.io/api', 
        apiKey: '', 
        nativeSymbol: 'AVAX', 
        name: 'Avalanche C-Chain', 
        priceKey: 'AVAX' 
    },
    FTM: { 
        baseUrl: 'https://api.ftmscan.com/api', 
        apiKey: '', 
        nativeSymbol: 'FTM', 
        name: 'Fantom Opera', 
        priceKey: 'FTM' 
    },
    CELO: { 
        baseUrl: 'https://api.celoscan.io/api', 
        apiKey: '', 
        nativeSymbol: 'CELO', 
        name: 'Celo Mainnet', 
        priceKey: 'CELO' 
    }
};

export const detectNetwork = (address: string): CryptoNetwork => {
    const cleaned = address.trim();
    
    // BITCOIN: Starts with 1, 3, or bc1. Length validation.
    if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/.test(cleaned)) return 'BTC';

    // XRP: Starts with r, length 25-35, alphanumeric (Base58 excluding 0,O,I,l)
    if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(cleaned)) return 'XRP';

    // TRON: Starts with T, length 34
    if (cleaned.startsWith('T') && cleaned.length === 34) return 'TRON';

    // SOLANA: Base58 string, 32-44 chars, does NOT start with T (Tron) or r (XRP) or 0x (EVM)
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cleaned) && !cleaned.startsWith('T')) return 'SOL';
    
    // EVM: Starts with 0x, length 42. Could be ETH, BSC, POLYGON, ARB, OP, etc.
    // Defaulting to ETH as the primary detection, user must switch for others.
    if (cleaned.startsWith('0x') && cleaned.length === 42) return 'ETH'; 
    
    return 'UNKNOWN';
};

const fetchCryptoPrices = async (): Promise<{ [key: string]: number }> => {
    const prices: { [key: string]: number } = {
        'ETH': 0, 'TRX': 0, 'BNB': 0, 'MATIC': 0,
        'BTC': 0, 'AVAX': 0, 'OP': 0, 'ARB': 0, 'XRP': 0, 'FTM': 0, 'CELO': 0, 'SOL': 0
    };

    try {
        // Try fetching from Binance Public API (usually reliable without auth)
        const symbols = [
            'ETHUSDT', 'TRXUSDT', 'BNBUSDT', 'MATICUSDT',
            'BTCUSDT', 'AVAXUSDT', 'OPUSDT', 'ARBUSDT', 'XRPUSDT', 'FTMUSDT', 'CELOUSDT', 'SOLUSDT'
        ];

        for (const symbol of symbols) {
            try {
                const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
                if (res.ok) {
                    const data = await res.json();
                    const price = parseFloat(data.price);

                    if (symbol === 'ETHUSDT') prices['ETH'] = price;
                    if (symbol === 'TRXUSDT') prices['TRX'] = price;
                    if (symbol === 'BNBUSDT') prices['BNB'] = price;
                    if (symbol === 'MATICUSDT') prices['MATIC'] = price;
                    if (symbol === 'BTCUSDT') prices['BTC'] = price;
                    if (symbol === 'AVAXUSDT') prices['AVAX'] = price;
                    if (symbol === 'OPUSDT') prices['OP'] = price;
                    if (symbol === 'ARBUSDT') prices['ARB'] = price;
                    if (symbol === 'XRPUSDT') prices['XRP'] = price;
                    if (symbol === 'FTMUSDT') prices['FTM'] = price;
                    if (symbol === 'CELOUSDT') prices['CELO'] = price;
                    if (symbol === 'SOLUSDT') prices['SOL'] = price;
                }
            } catch (e) {
                console.warn(`Failed to fetch price for ${symbol}`, e);
            }
        }
    } catch (e) {
        console.error("Error fetching crypto prices", e);
    }
    return prices;
};

/**
 * Calculates USD Financials (Received/Sent) based on strict address matching and price normalization.
 */
const calculateFinancialsUSD = (
    address: string, 
    transactions: CryptoTransaction[], 
    network: CryptoNetwork,
    currentPrices: { [key: string]: number }
) => {
    let totalReceivedUSD = 0;
    let totalSentUSD = 0;
    let totalReceivedNative = 0;
    let totalSentNative = 0;

    // Normalization logic
    const normalizedCurrent = (network === 'TRON' || network === 'BTC' || network === 'XRP') 
        ? address.trim() 
        : address.toLowerCase();
    
    // Price Determination
    let nativePrice = 0;
    
    // If the network is defined in our EVM config, use its priceKey
    if (EVM_NETWORKS[network]) {
        nativePrice = currentPrices[EVM_NETWORKS[network].priceKey] || 0;
    } else if (network === 'TRON') {
        nativePrice = currentPrices['TRX'] || 0;
    } else if (network === 'BTC') {
        nativePrice = currentPrices['BTC'] || 0;
    } else if (network === 'XRP') {
        nativePrice = currentPrices['XRP'] || 0;
    }

    const STABLECOINS = ['USDT', 'USDC', 'DAI', 'BUSD', 'FDUSD', 'CUSD', 'CEUR'];

    transactions.forEach(tx => {
        if (tx.isError) return;

        // Address matching logic depends on network case sensitivity
        let txTo = tx.to;
        let txFrom = tx.from;
        
        if (network === 'BTC' || network === 'XRP') {
            // Case sensitive networks
            // Keep as is
        } else if (network === 'TRON') {
            txTo = txTo.trim();
            txFrom = txFrom.trim();
        } else {
            // EVM case insensitive
            txTo = txTo.toLowerCase();
            txFrom = txFrom.toLowerCase();
        }
        
        let usdValue = 0;
        let isNative = false;

        // Valuation Logic
        const nativeTokens = ['ETH', 'TRX', 'BNB', 'MATIC', 'BTC', 'AVAX', 'XRP', 'FTM', 'CELO'];
        
        if (!tx.tokenSymbol || nativeTokens.includes(tx.tokenSymbol)) {
            usdValue = tx.value * nativePrice;
            isNative = true;
        } else if (tx.tokenSymbol && STABLECOINS.includes(tx.tokenSymbol.toUpperCase())) {
            usdValue = tx.value * 1.0; 
        } else {
            return; // Ignore other tokens for summary
        }

        // Logic: IN (Deposit)
        if (txTo === normalizedCurrent) {
            totalReceivedUSD += usdValue;
            if (isNative) totalReceivedNative += tx.value;
        }

        // Logic: OUT (Withdrawal)
        if (txFrom === normalizedCurrent) {
            totalSentUSD += usdValue;
            if (isNative) totalSentNative += tx.value;
        }
    });

    return { totalReceivedUSD, totalSentUSD, totalReceivedNative, totalSentNative };
};

// --- XRP (RIPPLE) FETCHER ---
const fetchXrpData = async (address: string, prices: { [key: string]: number }): Promise<Partial<CryptoWalletProfile>> => {
    try {
        const BASE_URL = 'https://api.xrpscan.com/api/v1';
        
        // 1. Get Account Info
        const accountRes = await fetch(`${BASE_URL}/account/${address}`);
        if (!accountRes.ok) throw new Error("Dirección XRP no encontrada o error de API.");
        const accountData = await accountRes.json();
        
        const nativeBalance = (parseFloat(accountData.xrpBalance) || 0); 
        
        // 2. Get Transactions (Limit 50)
        const txsRes = await fetch(`${BASE_URL}/account/${address}/transactions?limit=50`);
        const txsData = await txsRes.json();
        
        const transactions: CryptoTransaction[] = [];
        const txArray = txsData.transactions || [];

        txArray.forEach((tx: any) => {
            const amount = tx.Amount;
            let value = 0;
            let tokenSymbol = 'XRP';

            if (typeof amount === 'string') {
                value = parseInt(amount) / 1_000_000;
                tokenSymbol = 'XRP';
            } else if (typeof amount === 'object' && amount.currency) {
                value = parseFloat(amount.value);
                tokenSymbol = amount.currency;
            }

            transactions.push({
                hash: tx.hash,
                timeStamp: new Date(tx.date).toISOString(),
                from: tx.Account,
                to: tx.Destination,
                value: value,
                isError: tx.meta?.TransactionResult !== 'tesSUCCESS',
                tokenSymbol: tokenSymbol
            });
        });

        const { totalReceivedUSD, totalSentUSD, totalReceivedNative, totalSentNative } = calculateFinancialsUSD(address, transactions, 'XRP', prices);
        const netWorthUSD = nativeBalance * (prices['XRP'] || 0);
        const activeDays = new Set(transactions.map(t => t.timeStamp.split('T')[0])).size;

        return {
            address,
            network: 'XRP',
            nativeBalance,
            tokens: [{ tokenName: 'Ripple', tokenSymbol: 'XRP', balance: nativeBalance }],
            firstActivity: transactions.length > 0 ? transactions[transactions.length - 1].timeStamp : new Date().toISOString(),
            lastActivity: transactions.length > 0 ? transactions[0].timeStamp : new Date().toISOString(),
            totalTxCount: txArray.length,
            totalReceived: totalReceivedNative,
            totalSent: totalSentNative,
            totalReceivedUSD,
            totalSentUSD,
            netWorthUSD,
            activeDays,
            transactions
        };

    } catch (e: any) {
        console.error("XRP Fetch Error:", e);
        throw new Error(`Error conectando a XRP Scan: ${e.message}`);
    }
};

// --- BITCOIN FETCHER (Using mempool.space API) ---
const fetchBtcData = async (address: string, prices: { [key: string]: number }): Promise<Partial<CryptoWalletProfile>> => {
    try {
        const BASE_URL = 'https://mempool.space/api';
        
        // 1. Get Address Summary
        const summaryRes = await fetch(`${BASE_URL}/address/${address}`);
        if (!summaryRes.ok) throw new Error("Dirección BTC no encontrada o error de API.");
        const summary = await summaryRes.json();
        
        const funded = (summary.chain_stats.funded_txo_sum + summary.mempool_stats.funded_txo_sum) / 100000000;
        const spent = (summary.chain_stats.spent_txo_sum + summary.mempool_stats.spent_txo_sum) / 100000000;
        const nativeBalance = funded - spent;
        
        // 2. Get Transactions (Last 50)
        const txsRes = await fetch(`${BASE_URL}/address/${address}/txs`);
        const txsData = await txsRes.json();
        
        const transactions: CryptoTransaction[] = [];
        
        if (Array.isArray(txsData)) {
            txsData.forEach((tx: any) => {
                let isIncoming = false;
                let value = 0;
                let counterparty = "Multiple Inputs/Outputs"; 
                
                const inputFromMe = tx.vin.find((v: any) => v.prevout && v.prevout.scriptpubkey_address === address);
                
                if (inputFromMe) {
                    isIncoming = false;
                    const outputsToOthers = tx.vout.filter((v: any) => v.scriptpubkey_address !== address);
                    value = outputsToOthers.reduce((acc: number, v: any) => acc + v.value, 0) / 100000000;
                    counterparty = outputsToOthers.length > 0 ? outputsToOthers[0].scriptpubkey_address : "Self/Fee";
                } else {
                    isIncoming = true;
                    const outputsToMe = tx.vout.filter((v: any) => v.scriptpubkey_address === address);
                    value = outputsToMe.reduce((acc: number, v: any) => acc + v.value, 0) / 100000000;
                    counterparty = tx.vin.length > 0 && tx.vin[0].prevout ? tx.vin[0].prevout.scriptpubkey_address : "Coinbase/Unknown";
                }

                transactions.push({
                    hash: tx.txid,
                    timeStamp: tx.status.block_time ? new Date(tx.status.block_time * 1000).toISOString() : new Date().toISOString(),
                    from: isIncoming ? counterparty : address,
                    to: isIncoming ? address : counterparty,
                    value: value,
                    isError: !tx.status.confirmed,
                    tokenSymbol: 'BTC'
                });
            });
        }

        const { totalReceivedUSD, totalSentUSD, totalReceivedNative, totalSentNative } = calculateFinancialsUSD(address, transactions, 'BTC', prices);
        const netWorthUSD = nativeBalance * (prices['BTC'] || 0);
        const activeDays = new Set(transactions.map(t => t.timeStamp.split('T')[0])).size;

        return {
            address,
            network: 'BTC',
            nativeBalance,
            tokens: [{ tokenName: 'Bitcoin', tokenSymbol: 'BTC', balance: nativeBalance }],
            firstActivity: transactions.length > 0 ? transactions[transactions.length - 1].timeStamp : new Date().toISOString(),
            lastActivity: transactions.length > 0 ? transactions[0].timeStamp : new Date().toISOString(),
            totalTxCount: summary.chain_stats.tx_count + summary.mempool_stats.tx_count,
            totalReceived: totalReceivedNative,
            totalSent: totalSentNative,
            totalReceivedUSD,
            totalSentUSD,
            netWorthUSD,
            activeDays,
            transactions
        };

    } catch (e: any) {
        console.error("BTC Fetch Error:", e);
        throw new Error(`Error conectando a Bitcoin Explorer: ${e.message}`);
    }
};

// Generic EVM Fetcher with Deep Pagination & Token Transfers
const fetchEvmData = async (
    address: string, 
    network: CryptoNetwork, 
    baseUrl: string, 
    apiKey: string, 
    nativeSymbol: string,
    networkName: string,
    prices: { [key: string]: number }
): Promise<Partial<CryptoWalletProfile>> => {
    try {
        const apiKeyParam = apiKey ? `&apikey=${apiKey}` : '';
        
        // 1. Get Balance
        const balanceRes = await fetch(`${baseUrl}?module=account&action=balance&address=${address}&tag=latest${apiKeyParam}`);
        const balanceData = await balanceRes.json();
        const nativeBalance = balanceData.result ? parseFloat(balanceData.result) / 1e18 : 0;

        let allTransactions: CryptoTransaction[] = [];
        const maxPages = 5; 
        const offset = 1000;

        // 2. Fetch Native Txs
        let page = 1;
        while (page <= maxPages) {
            const txRes = await fetch(`${baseUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=${page}&offset=${offset}&sort=desc${apiKeyParam}`);
            const txData = await txRes.json();
            if (txData.status === '1' && Array.isArray(txData.result) && txData.result.length > 0) {
                const pageTxs = txData.result.map((tx: any) => ({
                    hash: tx.hash,
                    timeStamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
                    from: tx.from,
                    to: tx.to,
                    value: parseFloat(tx.value) / 1e18,
                    isError: tx.isError === '1',
                    gasUsed: parseInt(tx.gasUsed),
                    methodId: tx.methodId,
                    tokenSymbol: nativeSymbol 
                }));
                allTransactions = [...allTransactions, ...pageTxs];
                if (txData.result.length < offset) break;
                page++;
            } else break;
        }

        // 3. Fetch Token Transfers (ERC20)
        page = 1;
        while (page <= maxPages) {
            const tokenRes = await fetch(`${baseUrl}?module=account&action=tokentx&address=${address}&page=${page}&offset=${offset}&sort=desc${apiKeyParam}`);
            const tokenData = await tokenRes.json();
            if (tokenData.status === '1' && Array.isArray(tokenData.result) && tokenData.result.length > 0) {
                const pageTokens = tokenData.result.map((tx: any) => ({
                    hash: tx.hash,
                    timeStamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
                    from: tx.from,
                    to: tx.to,
                    value: parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal || '18')),
                    isError: false, 
                    gasUsed: parseInt(tx.gasUsed),
                    tokenSymbol: tx.tokenSymbol
                }));
                allTransactions = [...allTransactions, ...pageTokens];
                if (tokenData.result.length < offset) break;
                page++;
            } else break;
        }

        allTransactions.sort((a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime());
        
        // Calculate USD using the priceKey passed in
        let priceKey = 'ETH';
        if (EVM_NETWORKS[network]) {
            priceKey = EVM_NETWORKS[network].priceKey;
        }
        
        const { totalReceivedUSD, totalSentUSD, totalReceivedNative, totalSentNative } = calculateFinancialsUSD(address, allTransactions, network, prices);
        
        let netWorthUSD = nativeBalance * (prices[priceKey] || 0);

        const activeDays = new Set(allTransactions.map(t => t.timeStamp.split('T')[0])).size;

        return {
            address,
            network: network,
            nativeBalance,
            tokens: [{ tokenName: networkName, tokenSymbol: nativeSymbol, balance: nativeBalance }], 
            firstActivity: allTransactions.length > 0 ? allTransactions[allTransactions.length - 1].timeStamp : new Date().toISOString(),
            lastActivity: allTransactions.length > 0 ? allTransactions[0].timeStamp : new Date().toISOString(),
            totalTxCount: allTransactions.length, 
            totalReceived: totalReceivedNative,
            totalSent: totalSentNative,
            totalReceivedUSD,
            totalSentUSD,
            netWorthUSD,
            activeDays,
            transactions: allTransactions.slice(0, 1000)
        };
    } catch (e: any) {
        console.error(`${networkName} Fetch Error:`, e);
        throw new Error(`Error conectando a ${networkName}: ${e.message}`);
    }
};

const fetchTronData = async (address: string, prices: { [key: string]: number }): Promise<Partial<CryptoWalletProfile>> => {
    const BASE_URL = "https://apilist.tronscanapi.com/api";
    const headers = { 'TRON-PRO-API-KEY': TRONSCAN_API_KEY };

    const fetchWithFallback = async (url: string) => {
        try {
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err: any) {
            console.warn("Direct TronScan failed, trying public/proxy...", err.message);
            const publicUrl = url.replace('tronscanapi.com', 'tronscan.org');
            try { const res = await fetch(publicUrl); if (res.ok) return await res.json(); } catch(e) {}
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            const res = await fetch(proxyUrl);
            if (res.ok) return await res.json();
            throw new Error("Failed to fetch via all fallback methods");
        }
    };

    try {
        // 1. Account & Balances
        const accountData = await fetchWithFallback(`${BASE_URL}/account?address=${address}`);
        const nativeBalance = (accountData.balance || 0) / 1_000_000;
        
        const tokens: CryptoTokenBalance[] = [];
        tokens.push({ tokenName: 'Tron', tokenSymbol: 'TRX', balance: nativeBalance });

        // Net Worth Calculation
        let netWorthUSD = nativeBalance * (prices['TRX'] || 0);

        if (accountData.trc20token_balances) {
             accountData.trc20token_balances.forEach((t: any) => {
                const decimals = t.decimals || 6;
                const bal = parseFloat(t.balance) / Math.pow(10, decimals);
                // Safe symbol check
                const sym = (t.symbol || 'UNKNOWN').toUpperCase();
                if (bal > 0) {
                    tokens.push({
                        tokenName: t.tokenName,
                        tokenSymbol: t.symbol || 'UNK',
                        balance: bal,
                        contractAddress: t.tokenId
                    });
                    // Add Stablecoins to Net Worth
                    if (['USDT', 'USDC', 'USDD', 'TUSD'].includes(sym)) {
                        netWorthUSD += bal * 1.0; 
                    }
                }
            });
        }

        // 3. Transactions Loop
        let allTxs: any[] = [];
        let start = 0;
        const limit = 50; 
        const maxLimit = 5000; 

        while (start < maxLimit) {
            const txData = await fetchWithFallback(`${BASE_URL}/transaction?sort=-timestamp&count=true&limit=${limit}&start=${start}&address=${address}`);
            const batch = txData.data || [];
            allTxs = [...allTxs, ...batch];
            if (batch.length < limit) break;
            start += limit;
        }

        // 4. Unified List
        const unifiedTransactions: CryptoTransaction[] = [];
        
        allTxs.forEach((tx: any) => {
            if (!unifiedTransactions.some(t => t.hash === tx.hash)) {
                unifiedTransactions.push({
                    hash: tx.hash,
                    timeStamp: new Date(tx.timestamp).toISOString(),
                    from: tx.ownerAddress,
                    to: tx.toAddress,
                    value: (tx.amount || 0) / 1_000_000,
                    isError: tx.result === 'FAILED',
                    gasUsed: tx.cost ? tx.cost.net_fee : 0,
                    tokenSymbol: 'TRX'
                });
            }
        });

        // 5. TRC20 Transfers (Fetch deeper history)
        start = 0;
        const maxTokenLimit = 5000;
        while (start < maxTokenLimit) {
             const tokenData = await fetchWithFallback(`${BASE_URL}/token_trc20/transfers?limit=${limit}&start=${start}&sort=-timestamp&relatedAddress=${address}`);
             const batch = tokenData.token_transfers || [];
             batch.forEach((tx: any) => {
                 const decimals = tx.tokenInfo ? tx.tokenInfo.tokenDecimal : 6;
                 const val = parseFloat(tx.quant) / Math.pow(10, decimals);
                 unifiedTransactions.push({
                    hash: tx.transaction_id,
                    timeStamp: new Date(tx.block_ts).toISOString(),
                    from: tx.from_address,
                    to: tx.to_address,
                    value: val,
                    isError: false, 
                    tokenSymbol: tx.tokenInfo ? tx.tokenInfo.tokenAbbr : 'UNKNOWN'
                });
            });
            if (batch.length < limit) break;
            start += limit;
        }

        unifiedTransactions.sort((a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime());

        // Calculate Financials USD
        const { totalReceivedUSD, totalSentUSD, totalReceivedNative, totalSentNative } = calculateFinancialsUSD(address, unifiedTransactions, 'TRON', prices);
        
        const activeDays = new Set(unifiedTransactions.map(t => t.timeStamp.split('T')[0])).size;

        return {
            address,
            network: 'TRON',
            nativeBalance,
            tokens,
            firstActivity: unifiedTransactions.length > 0 ? unifiedTransactions[unifiedTransactions.length - 1].timeStamp : new Date().toISOString(),
            lastActivity: unifiedTransactions.length > 0 ? unifiedTransactions[0].timeStamp : new Date().toISOString(),
            totalTxCount: allTxs.length, 
            totalReceived: totalReceivedNative,
            totalSent: totalSentNative,
            totalReceivedUSD,
            totalSentUSD,
            netWorthUSD,
            activeDays,
            transactions: unifiedTransactions.slice(0, 1000) 
        };

    } catch (e: any) {
        console.error("TRON Fetch Error (Final):", e);
        throw new Error(`Error conectando a TronScan: ${e.message}`);
    }
};

// --- SOLANA FETCHER ---
const fetchSolanaData = async (address: string, prices: { [key: string]: number }): Promise<Partial<CryptoWalletProfile>> => {
    const RPC = 'https://api.mainnet-beta.solana.com';

    const rpcPost = async (body: object) => {
        const res = await fetch(RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`Solana RPC HTTP ${res.status}`);
        return res.json();
    };

    try {
        // 1. Balance (lamports → SOL)
        const balanceResp = await rpcPost({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] });
        const nativeBalance = (balanceResp.result?.value || 0) / 1e9;

        // 2. Recent signatures (limit 50)
        const sigsResp = await rpcPost({
            jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress',
            params: [address, { limit: 50 }]
        });
        const signatures: any[] = sigsResp.result || [];

        // Map signatures to CryptoTransaction (simplified — no individual tx value parsing)
        const transactions: CryptoTransaction[] = signatures.map((sig: any) => ({
            hash: sig.signature,
            timeStamp: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : new Date().toISOString(),
            from: address,
            to: '',
            value: 0,
            isError: !!sig.err,
            tokenSymbol: 'SOL'
        }));

        // 3. Token accounts (USDT/USDC)
        const tokenAccountsResp = await rpcPost({
            jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner',
            params: [
                address,
                { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
                { encoding: 'jsonParsed' }
            ]
        });

        const tokens: CryptoTokenBalance[] = [
            { tokenName: 'Solana', tokenSymbol: 'SOL', balance: nativeBalance }
        ];

        const tokenAccounts: any[] = tokenAccountsResp.result?.value || [];
        tokenAccounts.forEach((acc: any) => {
            const info = acc.account?.data?.parsed?.info;
            if (!info) return;
            const mint = info.mint as string;
            const amount = parseFloat(info.tokenAmount?.uiAmountString || '0');
            if (amount <= 0) return;

            // Identify well-known stablecoins by mint
            const KNOWN_MINTS: { [key: string]: string } = {
                'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
                'So11111111111111111111111111111111111111112': 'SOL',
            };
            const symbol = KNOWN_MINTS[mint] || mint.slice(0, 6);
            tokens.push({
                tokenName: symbol,
                tokenSymbol: symbol,
                balance: amount,
                contractAddress: mint,
                usdValue: ['USDT', 'USDC'].includes(symbol) ? amount : undefined
            });
        });

        const solPrice = prices['SOL'] || 0;
        const netWorthUSD = nativeBalance * solPrice +
            tokens.filter(t => t.tokenSymbol !== 'SOL' && t.usdValue).reduce((s, t) => s + (t.usdValue || 0), 0);

        const activeDays = new Set(transactions.map(t => t.timeStamp.split('T')[0])).size;

        transactions.sort((a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime());

        return {
            address,
            network: 'SOL',
            nativeBalance,
            tokens,
            firstActivity: transactions.length > 0 ? transactions[transactions.length - 1].timeStamp : new Date().toISOString(),
            lastActivity: transactions.length > 0 ? transactions[0].timeStamp : new Date().toISOString(),
            totalTxCount: signatures.length,
            totalReceived: 0,
            totalSent: 0,
            totalReceivedUSD: 0,
            totalSentUSD: 0,
            netWorthUSD,
            activeDays,
            transactions
        };

    } catch (e: any) {
        console.error('Solana Fetch Error:', e);
        throw new Error(`Error conectando a Solana RPC: ${e.message}`);
    }
};

export const fetchWalletData = async (address: string, network: CryptoNetwork): Promise<CryptoWalletProfile> => {
    let data: Partial<CryptoWalletProfile>;
    
    try {
        const prices = await fetchCryptoPrices();

        if (network === 'TRON') {
            data = await fetchTronData(address, prices);
        } else if (network === 'BTC') {
            data = await fetchBtcData(address, prices);
        } else if (network === 'XRP') {
            data = await fetchXrpData(address, prices);
        } else if (network === 'SOL') {
            data = await fetchSolanaData(address, prices);
        } else if (EVM_NETWORKS[network]) {
            // UNIFIED EVM LOGIC FOR ALL OTHER NETWORKS
            const config = EVM_NETWORKS[network];
            data = await fetchEvmData(
                address, 
                network, 
                config.baseUrl, 
                config.apiKey || '', 
                config.nativeSymbol, 
                config.name, 
                prices
            );
        } else {
            // Fallback for ETH if selected specifically or auto-detected as generic 0x
            if (network === 'ETH') {
                 const config = EVM_NETWORKS['ETH'];
                 data = await fetchEvmData(address, 'ETH', config.baseUrl, config.apiKey || '', config.nativeSymbol, config.name, prices);
            } else {
                throw new Error(`Red no soportada: ${network}`);
            }
        }
    } catch (e: any) {
        throw e; 
    }

    return {
        address,
        network,
        nativeBalance: 0,
        tokens: [],
        firstActivity: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        totalTxCount: 0,
        totalReceived: 0,
        totalSent: 0,
        totalReceivedUSD: 0,
        totalSentUSD: 0,
        netWorthUSD: 0,
        activeDays: 0,
        transactions: [],
        ...data
    };
};
