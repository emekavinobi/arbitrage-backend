const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Binance API Configuration
const BINANCE_CONFIG = {
  baseUrl: 'https://api.binance.com',
  apiKey: process.env.BINANCE_API_KEY,
  secretKey: process.env.BINANCE_SECRET_KEY
};

// Enhanced Binance API with ALL coins
const binanceAPI = {
  // Get ALL trading pairs
  getAllPrices: async () => {
    try {
      const response = await axios.get(`${BINANCE_CONFIG.baseUrl}/api/v3/ticker/price`);
      return response.data;
    } catch (error) {
      console.error('Binance API Error:', error.response?.data || error.message);
      throw error;
    }
  },

  // Get specific pairs with filtering
  getPairsByQuote: async (quoteAsset) => {
    const allPrices = await binanceAPI.getAllPrices();
    return allPrices.filter(pair => pair.symbol.endsWith(quoteAsset));
  },

  // Get 24hr ticker for volume filtering
  get24hrTickers: async () => {
    try {
      const response = await axios.get(`${BINANCE_CONFIG.baseUrl}/api/v3/ticker/24hr`);
      return response.data;
    } catch (error) {
      console.error('Binance 24hr error:', error.message);
      return [];
    }
  }
};

// Smart coin filtering
const filterLiquidCoins = (pairs, tickers = []) => {
  return pairs.filter(pair => {
    const coin = pair.symbol.replace(/USDT|BUSD|BTC|ETH$/g, '');
    
    // Exclude stablecoins and leveraged tokens
    const excludedCoins = ['USDC', 'USDP', 'TUSD', 'DAI', 'EUR', 'GBP', 'TRY'];
    const excludedPatterns = [/UPUSDT$/, /DOWNUSDT$/, /BULLUSDT$/, /BEARUSDT$/, /^BUSD/];
    
    const isExcluded = excludedCoins.includes(coin) || 
                      excludedPatterns.some(pattern => pattern.test(pair.symbol));
    
    // Filter by volume if tickers available
    if (tickers.length > 0) {
      const ticker = tickers.find(t => t.symbol === pair.symbol);
      if (ticker) {
        const volume = parseFloat(ticker.quoteVolume);
        return !isExcluded && volume > 100000; // $100k+ daily volume
      }
    }
    
    return !isExcluded;
  });
};

// Triangular arbitrage calculator
const calculateTriangularPath = (price1, price2, price3, path, coin) => {
  const theoreticalOutput = (1 / price1) * (1 / price2) * price3;
  const profitPercentage = ((theoreticalOutput - 1) * 100);
  
  return {
    type: 'TRIANGULAR',
    path: path,
    coin: coin,
    percentage: parseFloat(profitPercentage.toFixed(3)),
    theoreticalOutput: theoreticalOutput.toFixed(6),
    buyPrice: price1,
    sellPrice: price3,
    steps: [
      `Start with 1 USDT`,
      `Buy ${(1 / price1).toFixed(8)} BTC`,
      `Buy ${((1 / price1) * (1 / price2)).toFixed(8)} ${coin}`,
      `Sell for ${theoreticalOutput.toFixed(6)} USDT`
    ],
    profit: `$${(theoreticalOutput - 1).toFixed(6)} per USDT cycle`,
    timestamp: new Date().toISOString()
  };
};

// MAIN: Find ALL triangular arbitrage opportunities
const findAllTriangularArbitrage = async (strategy = 'quick') => {
  try {
    console.log(`🔍 Scanning ALL coins for triangular arbitrage (${strategy})...`);
    
    const [allPrices, tickers24hr] = await Promise.all([
      binanceAPI.getAllPrices(),
      binanceAPI.get24hrTickers()
    ]);

    // Get filtered pairs
    const usdtPairs = filterLiquidCoins(
      allPrices.filter(p => p.symbol.endsWith('USDT')),
      tickers24hr
    );
    
    const btcPairs = filterLiquidCoins(
      allPrices.filter(p => p.symbol.endsWith('BTC') && !p.symbol.startsWith('BTC')),
      tickers24hr
    );

    const busdPairs = filterLiquidCoins(
      allPrices.filter(p => p.symbol.endsWith('BUSD')),
      tickers24hr
    );

    const opportunities = [];
    
    // Strategy 1: USDT → BTC → ALT → USDT (Most Profitable)
    console.log('💰 Scanning USDT → BTC → ALT → USDT paths...');
    
    const btcUsdt = usdtPairs.find(p => p.symbol === 'BTCUSDT');
    if (!btcUsdt) throw new Error('BTC/USDT pair not found');

    const btcPrice = parseFloat(btcUsdt.price);
    
    // Limit scan based on strategy
    const scanLimit = strategy === 'quick' ? 50 : strategy === 'medium' ? 100 : btcPairs.length;
    
    for (const btcPair of btcPairs.slice(0, scanLimit)) {
      const altCoin = btcPair.symbol.replace('BTC', '');
      const usdtPair = usdtPairs.find(p => p.symbol === `${altCoin}USDT`);
      
      if (usdtPair) {
        const pathProfit = calculateTriangularPath(
          btcPrice,
          parseFloat(btcPair.price),
          parseFloat(usdtPair.price),
          `USDT → BTC → ${altCoin} → USDT`,
          altCoin
        );
        
        // Adjust threshold based on strategy
        const threshold = strategy === 'quick' ? 0.3 : 0.2;
        if (pathProfit.percentage > threshold) {
          opportunities.push(pathProfit);
        }
      }
    }

    // Strategy 2: USDT → BUSD → ALT → USDT
    console.log('💰 Scanning USDT → BUSD → ALT → USDT paths...');
    
    for (const busdPair of busdPairs.slice(0, scanLimit)) {
      const altCoin = busdPair.symbol.replace('BUSD', '');
      const usdtPair = usdtPairs.find(p => p.symbol === `${altCoin}USDT`);
      
      if (usdtPair) {
        const busdPrice = parseFloat(busdPair.price);
        const usdtPrice = parseFloat(usdtPair.price);
        const difference = Math.abs(usdtPrice - busdPrice);
        const percentage = (difference / Math.min(usdtPrice, busdPrice)) * 100;
        
        if (percentage > 0.15) {
          opportunities.push({
            type: 'CROSS_PAIR',
            path: `${altCoin}/USDT ↔ ${altCoin}/BUSD`,
            coin: altCoin,
            percentage: parseFloat(percentage.toFixed(3)),
            buyPrice: Math.min(usdtPrice, busdPrice),
            sellPrice: Math.max(usdtPrice, busdPrice),
            profit: `$${difference.toFixed(4)} per ${altCoin}`,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    console.log(`✅ Found ${opportunities.length} opportunities`);
    
    // Sort by profit percentage (highest first)
    return opportunities.sort((a, b) => b.percentage - a.percentage);
    
  } catch (error) {
    console.error('❌ Triangular arbitrage scan failed:', error);
    return [];
  }
};

// API Endpoints
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Binance All-Coins Arbitrage Scanner',
    version: '2.0',
    endpoints: {
      prices: '/api/prices',
      triangular: '/api/arbitrage/triangular?strategy=quick|medium|full',
      crossPair: '/api/arbitrage/cross-pair'
    }
  });
});

// Get all prices
app.get('/api/prices', async (req, res) => {
  try {
    const allPrices = await binanceAPI.getAllPrices();
    const filteredPrices = filterLiquidCoins(allPrices);
    
    res.json({
      success: true,
      count: filteredPrices.length,
      prices: filteredPrices.slice(0, 100), // Return top 100
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Triangular arbitrage endpoint
app.get('/api/arbitrage/triangular', async (req, res) => {
  try {
    const strategy = req.query.strategy || 'quick';
    const opportunities = await findAllTriangularArbitrage(strategy);
    
    res.json({
      success: true,
      strategy: strategy,
      count: opportunities.length,
      opportunities: opportunities,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Cross-pair arbitrage endpoint
app.get('/api/arbitrage/cross-pair', async (req, res) => {
  try {
    const [usdtPairs, busdPairs] = await Promise.all([
      binanceAPI.getPairsByQuote('USDT'),
      binanceAPI.getPairsByQuote('BUSD')
    ]);

    const opportunities = [];
    
    for (const usdtPair of usdtPairs.slice(0, 100)) {
      const coin = usdtPair.symbol.replace('USDT', '');
      const busdPair = busdPairs.find(p => p.symbol === `${coin}BUSD`);
      
      if (busdPair) {
        const usdtPrice = parseFloat(usdtPair.price);
        const busdPrice = parseFloat(busdPair.price);
        const difference = Math.abs(usdtPrice - busdPrice);
        const percentage = (difference / Math.min(usdtPrice, busdPrice)) * 100;
        
        if (percentage > 0.1) {
          opportunities.push({
            coin: coin,
            buyOn: usdtPrice < busdPrice ? 'USDT' : 'BUSD',
            sellOn: usdtPrice < busdPrice ? 'BUSD' : 'USDT',
            buyPrice: Math.min(usdtPrice, busdPrice),
            sellPrice: Math.max(usdtPrice, busdPrice),
            percentage: parseFloat(percentage.toFixed(3)),
            profit: `$${difference.toFixed(6)} per ${coin}`,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
    
    res.json({
      success: true,
      count: opportunities.length,
      opportunities: opportunities.sort((a, b) => b.percentage - a.percentage),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 All-Coins Arbitrage Scanner running on port ${PORT}`);
  console.log(`🔍 Triangular: http://localhost:${PORT}/api/arbitrage/triangular`);
  console.log(`🔄 Cross-Pair: http://localhost:${PORT}/api/arbitrage/cross-pair`);
});

module.exports = app;
