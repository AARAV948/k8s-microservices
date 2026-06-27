const express = require('express');
const mongoose = require('mongoose');

const app = express();
const PORT = 3000;

// The database URL will be provided by Kubernetes later
const DB_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/shop';

// Define a simple product database schema
const Product = mongoose.model('Product', new mongoose.Schema({
    name: String,
    price: Number
}));

// Connect to MongoDB
mongoose.connect(DB_URL)
    .then(() => console.log('Successfully connected to MongoDB!'))
    .catch(err => console.error('MongoDB connection error:', err));

app.use(express.json());

// API Endpoints
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const newProduct = new Product(req.body);
        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/health', (req, res) => res.send('Backend is operational'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
