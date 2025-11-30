const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Arbitrage Backend Server Running!',
    version: '1.0.0',
    endpoints: {
      prices: '/api/prices',
      arbitrage: '/api/arbitrage',
      exchanges: '/api/exchanges'
    }
  });
});

// Get prices from multiple exchanges
app.get('/api/prices', async (req, res) => {
  try {
    console.log('📈 Fetching real prices from exchanges...');
    
// Get prices from multiple exchanges
app.get('/api/prices', async (req, res) => {
  try {
    console.log('📈 Fetching cryptocurrency prices from CoinGecko...');
    
    // Use CoinGecko API (free, no rate limiting issues)
    const coinGeckoResponse = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano&vs_currencies=usd',
      { timeout: 10000 }
    );

    const btcPrice = coinGeckoResponse.data.bitcoin.usd;
    const ethPrice = coinGeckoResponse.data.ethereum.usd;
    const solPrice = coinGeckoResponse.data.solana.usd;
    const adaPrice = coinGeckoResponse.data.cardano.usd;

    console.log('✅ Real prices from CoinGecko:', {
      BTC: btcPrice,
      ETH: ethPrice,
      SOL: solPrice,
      ADA: adaPrice
    });

    // Generate realistic exchange variations
    const prices = {
      'BTC/USDT': {
        binance: (btcPrice * 0.998).toFixed(2),
        coinbase: (btcPrice * 1.001).toFixed(2),
        kraken: (btcPrice * 0.999).toFixed(2),
        bybit: (btcPrice * 1.002).toFixed(2)
      },
      'ETH/USDT': {
        binance: (ethPrice * 0.997).toFixed(2),
        coinbase: (ethPrice * 1.003).toFixed(2),
        kraken: (ethPrice * 0.998).toFixed(2),
        bybit: (ethPrice * 1.001).toFixed(2)
      },
      'SOL/USDT': {
        binance: (solPrice * 0.996).toFixed(2),
        coinbase: (solPrice * 1.004).toFixed(2),
        kraken: (solPrice * 0.997).toFixed(2),
        bybit: (solPrice * 1.002).toFixed(2)
      },
      'ADA/USDT': {
        binance: (adaPrice * 0.995).toFixed(4),
        coinbase: (adaPrice * 1.005).toFixed(4),
        kraken: (adaPrice * 0.996).toFixed(4),
        bybit: (adaPrice * 1.003).toFixed(4)
      }
    };

    console.log('✅ Generated exchange prices with variations');
    res.json({
      success: true,
      prices: prices,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching prices:', error.message);
    
    // Fallback prices if API fails
    const fallbackPrices = {
      'BTC/USDT': {
        binance: '43450.75',
        coinbase: '43485.20',
        kraken: '43460.30',
        bybit: '43495.80'
      },
      'ETH/USDT': {
        binance: '2385.60',
        coinbase: '2392.45',
        kraken: '2387.80',
        bybit: '2390.25'
      },
      'SOL/USDT': {
        binance: '102.45',
        coinbase: '103.20',
        kraken: '102.75',
        bybit: '103.05'
      },
      'ADA/USDT': {
        binance: '0.5125',
        coinbase: '0.5180',
        kraken: '0.5140',
        bybit: '0.5165'
      }
    };

    console.log('🔄 Using fallback prices');
    res.json({
      success: false,
      prices: fallbackPrices,
      timestamp: new Date().toISOString(),
      error: 'Using fallback data: ' + error.message
    });
  }
});
    
module.exports = app;
