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

// ENHANCED: Better triangular arbitrage detection
const findAllTriangularArbitrage = async (strategy = 'quick') => {
  try {
    console.log(`🔍 Scanning ALL coins for triangular arbitrage (${strategy})...`);
    
    const [allPrices, tickers24hr] = await Promise.all([
      binanceAPI.getAllPrices(),
      binanceAPI.get24hrTickers()
    ]);

    // Get ALL trading pairs (not just filtered)
    const usdtPairs = allPrices.filter(p => p.symbol.endsWith('USDT'));
    const btcPairs = allPrices.filter(p => p.symbol.endsWith('BTC') && !p.symbol.startsWith('BTC'));
    const ethPairs = allPrices.filter(p => p.symbol.endsWith('ETH') && !p.symbol.startsWith('ETH'));
    const busdPairs = allPrices.filter(p => p.symbol.endsWith('BUSD'));

    const opportunities = [];
    
    // Get base prices
    const btcUsdt = usdtPairs.find(p => p.symbol === 'BTCUSDT');
    const ethUsdt = usdtPairs.find(p => p.symbol === 'ETHUSDT');
    const btcEth = allPrices.find(p => p.symbol === 'ETHBTC');
    
    if (!btcUsdt || !ethUsdt) {
      throw new Error('Base pairs not found');
    }

    const btcPrice = parseFloat(btcUsdt.price);
    const ethPrice = parseFloat(ethUsdt.price);
    const btcEthPrice = btcEth ? parseFloat(btcEth.price) : ethPrice / btcPrice;

    // Strategy 1: USDT → BTC → ALT → USDT
    console.log('💰 Scanning USDT → BTC → ALT → USDT paths...');
    for (const btcPair of btcPairs.slice(0, 100)) {
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
        
        // LOWER threshold to 0.1% for testing
        if (pathProfit.percentage > 0.1) {
          opportunities.push(pathProfit);
        }
      }
    }

    // Strategy 2: USDT → ETH → ALT → USDT
    console.log('💰 Scanning USDT → ETH → ALT → USDT paths...');
    for (const ethPair of ethPairs.slice(0, 50)) {
      const altCoin = ethPair.symbol.replace('ETH', '');
      const usdtPair = usdtPairs.find(p => p.symbol === `${altCoin}USDT`);
      
      if (usdtPair) {
        const pathProfit = calculateTriangularPath(
          ethPrice,
          parseFloat(ethPair.price),
          parseFloat(usdtPair.price),
          `USDT → ETH → ${altCoin} → USDT`,
          altCoin
        );
        
        if (pathProfit.percentage > 0.1) {
          opportunities.push(pathProfit);
        }
      }
    }

    // Strategy 3: BTC → ETH → ALT → BTC (Different base)
    console.log('💰 Scanning BTC → ETH → ALT → BTC paths...');
    for (const ethPair of ethPairs.slice(0, 30)) {
      const altCoin = ethPair.symbol.replace('ETH', '');
      const btcPair = btcPairs.find(p => p.symbol === `${altCoin}BTC`);
      
      if (btcPair && btcEthPrice) {
        // Start with 1 BTC, buy ETH, buy ALT, sell ALT for BTC
        const ethAmount = 1 / btcEthPrice; // 1 BTC buys this much ETH
        const altAmount = ethAmount / parseFloat(ethPair.price); // ETH buys this much ALT
        const finalBtc = altAmount * parseFloat(btcPair.price); // ALT sells for this much BTC
        
        const profitPercentage = ((finalBtc - 1) * 100);
        
        if (profitPercentage > 0.1) {
          opportunities.push({
            type: 'TRIANGULAR',
            path: `BTC → ETH → ${altCoin} → BTC`,
            coin: altCoin,
            percentage: parseFloat(profitPercentage.toFixed(3)),
            theoreticalOutput: finalBtc.toFixed(6),
            profit: `${(finalBtc - 1).toFixed(6)} BTC per cycle`,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Strategy 4: USDT → ALT1 → ALT2 → USDT (Direct between alts)
    console.log('💰 Scanning USDT → ALT1 → ALT2 → USDT paths...');
    const topAltcoins = ['ADA', 'SOL', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI', 'ATOM'];
    
    for (let i = 0; i < topAltcoins.length; i++) {
      for (let j = i + 1; j < topAltcoins.length; j++) {
        const alt1 = topAltcoins[i];
        const alt2 = topAltcoins[j];
        
        const alt1Usdt = usdtPairs.find(p => p.symbol === `${alt1}USDT`);
        const alt2Usdt = usdtPairs.find(p => p.symbol === `${alt2}USDT`);
        const alt1Alt2 = allPrices.find(p => p.symbol === `${alt2}${alt1}`);
        
        if (alt1Usdt && alt2Usdt && alt1Alt2) {
          const pathProfit = calculateTriangularPath(
            parseFloat(alt1Usdt.price),
            parseFloat(alt1Alt2.price),
            parseFloat(alt2Usdt.price),
            `USDT → ${alt1} → ${alt2} → USDT`,
            `${alt1}/${alt2}`
          );
          
          if (pathProfit.percentage > 0.1) {
            opportunities.push(pathProfit);
          }
        }
      }
    }

    console.log(`✅ Found ${opportunities.length} triangular opportunities`);
    
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
      crossPair: '/api/arbitrage/cross-pair',
      test: '/api/arbitrage/test'
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
      prices: filteredPrices.slice(0, 100),
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

// TEST ENDPOINT - Guaranteed opportunities
app.get('/api/arbitrage/test', async (req, res) => {
  try {
    const testOpportunities = [
      {
        type: 'TRIANGULAR',
        path: 'USDT → BTC → DOGE → USDT',
        coin: 'DOGE',
        percentage: 0.45,
        theoreticalOutput: '1.004500',
        profit: '$0.004500 per USDT cycle',
        steps: [
          'Start with 1 USDT',
          'Buy 0.00001102 BTC',
          'Buy 90.524 DOGE for your BTC',
          'Sell for 1.004500 USDT for your DOGE'
        ],
        timestamp: new Date().toISOString()
      },
      {
        type: 'TRIANGULAR', 
        path: 'USDT → ETH → MATIC → USDT',
        coin: 'MATIC',
        percentage: 0.32,
        theoreticalOutput: '1.003200',
        profit: '$0.003200 per USDT cycle',
        steps: [
          'Start with 1 USDT',
          'Buy 0.000334 ETH',
          'Buy 8.924 MATIC for your ETH',
          'Sell for 1.003200 USDT for your MATIC'
        ],
        timestamp: new Date().toISOString()
      },
      {
        type: 'CROSS_PAIR',
        path: 'ADA/USDT ↔ ADA/BUSD',
        coin: 'ADA',
        percentage: 0.18,
        buyPrice: 0.4785,
        sellPrice: 0.4794,
        profit: '$0.0009 per ADA',
        timestamp: new Date().toISOString()
      }
    ];
    
    res.json({
      success: true,
      count: testOpportunities.length,
      opportunities: testOpportunities,
      message: 'TEST DATA - Real scanning shows 0 when market is efficient',
      note: 'This proves your app can display opportunities when they exist',
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
  console.log(`🧪 Test Data: http://localhost:${PORT}/api/arbitrage/test`);
});

module.exports = app;
