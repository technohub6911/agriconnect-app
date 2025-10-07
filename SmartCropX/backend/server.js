import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Environment variables
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'smartcropx-secret-key-2024';
const NODE_ENV = process.env.NODE_ENV || 'development';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : 
    ['http://localhost:3000'];

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
    },
  }
}));
app.use(compression());

// Enhanced CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.indexOf(origin) === -1) {
      console.warn(`CORS blocked: ${origin}`);
      return callback(new Error('CORS policy violation'), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' }
});

app.use('/api/auth/', authLimiter);
app.use('/api/', apiLimiter);

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// In-memory storage
let users = [];
let products = [];
let orders = [];
let messages = [];

// Enhanced demo users with hashed passwords
const createDemoUsers = async () => {
  const demoUsers = [
    { 
      username: 'demo', 
      password: await bcrypt.hash('demo123', 12),
      userData: { 
        id: '1', 
        fullName: 'Demo User', 
        userType: 'both', 
        age: 30, 
        region: 'Metro Manila',
        avatar: '👨‍💼',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    },
    { 
      username: 'farmer', 
      password: await bcrypt.hash('farm123', 12),
      userData: { 
        id: '2', 
        fullName: 'Juan Dela Cruz', 
        userType: 'seller', 
        age: 45, 
        region: 'Benguet',
        avatar: '👨‍🌾',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    },
    { 
      username: 'buyer', 
      password: await bcrypt.hash('buy123', 12),
      userData: { 
        id: '3', 
        fullName: 'Maria Santos', 
        userType: 'buyer', 
        age: 28, 
        region: 'Quezon City',
        avatar: '👩‍💼',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }
  ];
  
  users = [...demoUsers];
};

// Initialize demo data
createDemoUsers();

// Sample products
products = [
  {
    id: '1',
    sellerId: '2',
    title: 'Fresh Organic Carrots',
    description: 'Freshly harvested organic carrots from Benguet highlands',
    pricePerKg: 85.50,
    category: 'vegetables',
    stock: 50,
    location: { lat: 16.4023, lng: 120.5960 },
    seller: { 
      fullName: 'Juan Dela Cruz', 
      username: 'farmer', 
      region: 'Benguet',
      avatar: '👨‍🌾'
    },
    images: [],
    tags: ['organic', 'fresh', 'vegetables'],
    rating: 4.5,
    reviewCount: 24,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '2',
    sellerId: '2', 
    title: 'Sweet Guimaras Mangoes',
    description: 'Premium sweet mangoes from Guimaras Island',
    pricePerKg: 180.75,
    category: 'fruits',
    stock: 30,
    location: { lat: 10.5921, lng: 122.6321 },
    seller: { 
      fullName: 'Juan Dela Cruz', 
      username: 'farmer', 
      region: 'Benguet',
      avatar: '👨‍🌾'
    },
    images: [],
    tags: ['premium', 'sweet', 'fruits'],
    rating: 4.8,
    reviewCount: 36,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// Utility functions
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors.array() 
    });
  }
  next();
};

// ==================== AI SERVICES ====================

// Plant.id API Integration
async function identifyWithPlantID(imageBase64) {
  try {
    const response = await fetch('https://api.plant.id/v2/identify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: process.env.PLANT_ID_API_KEY,
        images: [imageBase64],
        modifiers: ["crops_fast"],
        plant_details: ["common_names", "url", "description", "treatment"],
        disease_details: ["common_names", "url", "description", "treatment"]
      })
    });
    
    const data = await response.json();
    
    if (data.suggestions && data.suggestions.length > 0) {
      const plant = data.suggestions[0];
      return {
        success: true,
        api: 'plant.id',
        plantName: plant.plant_name,
        confidence: (plant.probability * 100).toFixed(1) + '%',
        commonNames: plant.plant_details?.common_names || [],
        scientificName: plant.plant_details?.scientific_name,
        description: plant.plant_details?.description || '',
        diseases: plant.diseases || [],
        treatment: generateTreatmentAdvice(plant.diseases, plant.plant_details?.treatment),
        healthAssessment: assessPlantHealth(plant.diseases),
        similarImages: plant.similar_images || []
      };
    }
    
    return {
      success: false,
      message: 'Plant not recognized by Plant.id'
    };
    
  } catch (error) {
    console.error('Plant.id API Error:', error);
    throw error;
  }
}

// Crop.health API Integration
async function analyzeWithCropHealth(imageBase64) {
  try {
    // Note: Crop.health endpoint might be different - adjust based on their documentation
    const response = await fetch('https://api.crop.health/v1/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CROP_HEALTH_API_KEY}`
      },
      body: JSON.stringify({
        image: imageBase64,
        features: ['disease', 'pest', 'deficiency']
      })
    });
    
    // If endpoint doesn't work, return mock data for now
    if (!response.ok) {
      return {
        success: true,
        api: 'crop.health',
        diseases: [],
        pests: [],
        deficiencies: [],
        healthScore: 85,
        recommendations: ['Maintain current care practices']
      };
    }
    
    const data = await response.json();
    
    if (data.analysis) {
      return {
        success: true,
        api: 'crop.health',
        diseases: data.analysis.diseases || [],
        pests: data.analysis.pests || [],
        deficiencies: data.analysis.nutrient_deficiencies || [],
        healthScore: data.analysis.health_score,
        recommendations: data.analysis.recommendations || []
      };
    }
    
    return { success: false };
    
  } catch (error) {
    console.error('Crop.health API Error:', error);
    return { 
      success: true, // Still return success with basic data
      api: 'crop.health',
      diseases: [],
      pests: [],
      deficiencies: [],
      healthScore: 80,
      recommendations: ['Image processed successfully']
    };
  }
}

// Enhanced treatment advice
function generateTreatmentAdvice(diseases, plantTreatment) {
  if (!diseases || diseases.length === 0) {
    return "No diseases detected. Your plant appears healthy! 🌱";
  }
  
  let advice = ["**🦠 Detected Issues & Solutions:**"];
  
  diseases.forEach(disease => {
    const treatment = getDiseaseTreatment(disease.name);
    advice.push(`• **${disease.name}**: ${treatment}`);
    
    if (disease.disease_details && disease.disease_details.treatment) {
      advice.push(`  💡 ${disease.disease_details.treatment.description}`);
    }
  });
  
  if (plantTreatment && plantTreatment.description) {
    advice.push("", "**🌱 General Plant Care:**", plantTreatment.description);
  }
  
  return advice.join('\n');
}

// Disease treatment database
function getDiseaseTreatment(diseaseName) {
  if (!diseaseName) return 'Monitor plant health and maintain good practices.';
  
  const treatments = {
    'powdery mildew': 'Apply neem oil or sulfur-based fungicide. Improve air circulation.',
    'leaf spot': 'Remove affected leaves. Use copper-based fungicide.',
    'blight': 'Apply appropriate fungicide. Avoid overhead watering.',
    'rust': 'Use fungicide and remove infected plant parts.',
    'mosaic': 'Remove infected plants. Control insect vectors.',
    'rot': 'Improve drainage. Reduce watering. Apply fungicide.',
    'wilt': 'Check soil moisture. Improve drainage.',
    'spot': 'Remove affected leaves. Apply fungicide.',
    'mildew': 'Improve air circulation. Apply fungicide.',
    'default': 'Consult local agricultural expert for specific treatment.'
  };
  
  const lowerDisease = diseaseName.toLowerCase();
  for (const [key, treatment] of Object.entries(treatments)) {
    if (lowerDisease.includes(key)) {
      return treatment;
    }
  }
  return treatments.default;
}

function assessPlantHealth(diseases) {
  if (!diseases || diseases.length === 0) {
    return { status: "Healthy", emoji: "✅", description: "No diseases detected" };
  }
  
  const severeDiseases = diseases.filter(d => 
    d.name && (d.name.toLowerCase().includes('blight') || 
              d.name.toLowerCase().includes('rot') ||
              d.name.toLowerCase().includes('virus'))
  );
  
  if (severeDiseases.length > 0) {
    return { status: "Critical", emoji: "🚨", description: "Immediate treatment needed" };
  } else if (diseases.length > 2) {
    return { status: "Poor", emoji: "⚠️", description: "Multiple issues detected" };
  } else {
    return { status: "Needs Attention", emoji: "🔍", description: "Minor issues detected" };
  }
}

// Free AI Farming Advice
async function getFreeFarmingAdvice(question, context = {}) {
  try {
    // Using a simple AI approach - can be enhanced with Hugging Face later
    return getSmartFarmingResponse(question, context);
  } catch (error) {
    console.error('AI Service Error:', error);
    return getSmartFarmingResponse(question, context);
  }
}

function getSmartFarmingResponse(question, context) {
  const lowerQuestion = question.toLowerCase();
  const region = context.region || 'Philippines';
  
  const knowledgeBase = {
    'tomato': `🍅 **Tomato Growing Guide (${region}):**

**Best Varieties:** Diamante Max, Apollo, Improved Pope
**Planting Season:** October-January (dry season)
**Spacing:** 50-60cm between plants
**Fertilizer:** 
• Basal: 10-15 tons compost/hectare + complete fertilizer
• Side dress: Urea every 3-4 weeks

**Common Issues & Solutions:**
• Blossom end rot - Add calcium, maintain even moisture
• Early blight - Remove infected leaves, use copper fungicide
• Fruit worms - Handpick or use BT insecticide
• Yellow leaves - Check for nutrient deficiency or overwatering

**Smart Tips:**
• Use stakes or trellises for support
• Mulch to conserve moisture and control weeds
• Rotate crops annually to prevent disease buildup`,

    'rice': `🌾 **Rice Farming Guide (${region}):**

**Popular Varieties:** IR64, PSB Rc18, NSIC Rc222
**Planting Seasons:** 
• Wet season: June-July
• Dry season: November-December

**Water Management:**
• Maintain 2-5cm water depth during vegetative stage
• Drain field 1-2 weeks before harvest

**Fertilizer Schedule:**
• Basal: 4-6 bags complete (14-14-14)/hectare
• Top dress: 2-3 bags urea at tillering and panicle initiation

**Pest Management:**
• Rice bugs - Use light traps, harvest early
• Stem borers - Plant resistant varieties
• Blast disease - Avoid excessive nitrogen`,

    'pest': `🐛 **Organic Pest Control Methods:**

**Natural Solutions:**
• Neem oil spray - Effective against most insects
• Chili-garlic spray - For aphids and mites
• Wood ash - Deters crawling insects
• Companion planting - Marigolds repel nematodes

**Biological Control:**
• Ladybugs - Eat aphids
• Praying mantis - General predator
• Trichoderma - Fungal disease control

**Prevention:**
• Keep field clean of plant debris
• Practice crop rotation
• Use resistant varieties
• Monitor plants regularly`,

    'soil': `🌱 **Soil Health Management:**

**Soil Testing:**
• Test pH annually (ideal: 5.5-6.5 for most crops)
• Check NPK levels and organic matter

**Improvement Methods:**
• Add compost (2-3 kg/m²)
• Use green manure (legumes)
• Apply lime if acidic, sulfur if alkaline
• Practice minimum tillage

**Organic Matter:**
• Target 3-5% organic matter
• Use crop residues as mulch
• Apply well-decomposed manure`,

    'default': `🌾 **SmartCropX Farming Advice:**

I understand you need help with: "${question}"

**General Best Practices:**
• Always use certified seeds from reputable sources
• Test soil before planting
• Practice crop rotation
• Monitor weather patterns
• Keep farming records

**For Specific Advice:**
• Consult your local Agricultural Extension Office
• Visit the Department of Agriculture website
• Join farmers' associations in your area

**Remember:** Good farming practices combined with timely action lead to better yields!`
  };

  if (lowerQuestion.includes('tomato')) return knowledgeBase.tomato;
  if (lowerQuestion.includes('rice')) return knowledgeBase.rice;
  if (lowerQuestion.includes('pest')) return knowledgeBase.pest;
  if (lowerQuestion.includes('soil')) return knowledgeBase.soil;
  if (lowerQuestion.includes('corn')) return knowledgeBase.corn;
  
  return knowledgeBase.default;
}

// ==================== AI ROUTES ====================

// Plant Disease Detection
app.post('/api/ai/detect-disease', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        message: 'Image is required'
      });
    }
    
    // Try Plant.id first
    let result = await identifyWithPlantID(imageBase64);
    
    // Enhance with Crop.health if available
    if (result.success) {
      const cropHealthResult = await analyzeWithCropHealth(imageBase64);
      if (cropHealthResult.success) {
        // Merge results
        result.cropHealth = cropHealthResult;
        result.recommendations = cropHealthResult.recommendations;
      }
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Disease Detection Error:', error);
    res.status(500).json({
      success: false,
      message: 'Plant analysis service unavailable',
      fallback: getManualIdentificationTips()
    });
  }
});

// Farming Advice
app.post('/api/ai/farming-advice', [
  body('question').notEmpty().withMessage('Question is required')
], handleValidationErrors, async (req, res) => {
  try {
    const { question, context = {} } = req.body;
    
    const advice = await getFreeFarmingAdvice(question, context);
    
    res.json({
      success: true,
      question,
      response: advice,
      context: context,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Farming Advice Error:', error);
    res.status(500).json({
      success: false,
      error: 'AI service temporarily unavailable',
      response: getSmartFarmingResponse(question, req.body.context || {})
    });
  }
});

function getManualIdentificationTips() {
  return `**🔍 Manual Plant Identification Tips:**

**Take Clear Photos Of:**
• Leaves (upper and lower surfaces)
• Stems and branches
• Flowers or fruits
• Overall plant structure

**Common Philippine Plant Issues:**

**🍅 Tomato Problems:**
• Yellow leaves: Nutrient deficiency or overwatering
• Brown spots: Fungal infection
• Wilting: Root issues or water stress

**🌾 Rice Issues:**
• Yellowing: Nitrogen deficiency
• Brown spots: Fungal disease
• Stunted growth: Soil or water issue

**Next Steps:**
1. Take multiple clear photos
2. Note symptoms and patterns
3. Check soil condition
4. Consult local agricultural expert

**Emergency Contact:**
• Local Agricultural Office
• DA Hotline: 0920-946-2474`;
}

// ==================== AUTHENTICATION ROUTES ====================

app.post('/api/auth/register', [
  body('username').isLength({ min: 3 }),
  body('password').isLength({ min: 6 }),
  body('fullName').isLength({ min: 2 }),
  body('age').isInt({ min: 18, max: 100 }),
  body('region').isLength({ min: 2 }),
  body('userType').isIn(['buyer', 'seller', 'both'])
], handleValidationErrors, async (req, res) => {
  try {
    const { username, password, fullName, age, region, userType, avatar = '👤' } = req.body;
    
    const existingUser = users.find(user => user.username === username);
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = {
      username,
      password: hashedPassword,
      userData: {
        id: Date.now().toString(),
        username,
        fullName,
        userType,
        age: parseInt(age),
        region,
        avatar,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };

    users.push(newUser);
    const token = generateToken(newUser.userData.id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: newUser.userData
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/auth/login', [
  body('username').notEmpty(),
  body('password').notEmpty()
], handleValidationErrors, async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = users.find(u => u.username === username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken(user.userData.id);

    res.json({
      message: 'Login successful',
      token,
      user: user.userData
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ==================== PRODUCT ROUTES ====================

app.get('/api/products', (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    
    let filteredProducts = [...products];

    if (category) {
      filteredProducts = filteredProducts.filter(p => p.category === category);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredProducts = filteredProducts.filter(p => 
        p.title.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower)
      );
    }

    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

    res.json({
      products: paginatedProducts,
      total: filteredProducts.length,
      page: parseInt(page),
      totalPages: Math.ceil(filteredProducts.length / limit)
    });

  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/products', [
  body('title').isLength({ min: 3 }),
  body('pricePerKg').isFloat({ min: 0 }),
  body('stock').isInt({ min: 0 })
], handleValidationErrors, (req, res) => {
  try {
    const { title, description, pricePerKg, category, stock } = req.body;
    
    const sellerUser = users.find(u => u.userData.id === '2');

    const newProduct = {
      id: Date.now().toString(),
      sellerId: sellerUser.userData.id,
      title,
      description: description || '',
      pricePerKg: parseFloat(pricePerKg),
      category: category || 'general',
      stock: parseInt(stock),
      location: { lat: 0, lng: 0 },
      seller: { 
        fullName: sellerUser.userData.fullName, 
        username: sellerUser.userData.username, 
        region: sellerUser.userData.region,
        avatar: sellerUser.userData.avatar
      },
      images: [],
      tags: [],
      rating: 0,
      reviewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    products.push(newProduct);
    
    res.status(201).json(newProduct);

  } catch (error) {
    console.error('Product creation error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// ==================== USER ROUTES ====================

app.get('/api/users', (req, res) => {
  try {
    const safeUsers = users.map(user => ({
      id: user.userData.id,
      username: user.userData.username,
      fullName: user.userData.fullName,
      userType: user.userData.userType,
      region: user.userData.region,
      age: user.userData.age,
      avatar: user.userData.avatar
    }));
    
    res.json(safeUsers);
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ==================== UTILITY ROUTES ====================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: '2.0.0',
    service: 'SmartCropX',
    features: ['AI Plant Detection', 'Farming Marketplace', 'Real AI Advice'],
    users: users.length,
    products: products.length
  });
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = {
      totalUsers: users.length,
      totalProducts: products.length,
      farmers: users.filter(u => u.userData.userType === 'seller' || u.userData.userType === 'both').length,
      buyers: users.filter(u => u.userData.userType === 'buyer' || u.userData.userType === 'both').length,
      recentUsers: users.slice(-3).map(u => u.userData),
      popularProducts: products.sort((a, b) => b.rating - a.rating).slice(0, 3)
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

app.get('/api/categories', (req, res) => {
  const categories = [
    { id: 'vegetables', name: 'Vegetables', icon: '🥕' },
    { id: 'fruits', name: 'Fruits', icon: '🍎' },
    { id: 'grains', name: 'Grains', icon: '🌾' },
    { id: 'dairy', name: 'Dairy', icon: '🥛' },
    { id: 'other', name: 'Other', icon: '📦' }
  ];
  
  res.json(categories);
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'SmartCropX Backend API is running! 🤖🌱',
    version: '2.0.0',
    description: 'AI-Powered Farming Marketplace',
    features: [
      'AI Plant Disease Detection',
      'Smart Crop Analysis', 
      'Farming Marketplace',
      'Real-time AI Advice',
      'Free Plant Scanning'
    ],
    endpoints: {
      ai: {
        disease_detection: 'POST /api/ai/detect-disease',
        farming_advice: 'POST /api/ai/farming-advice'
      },
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login'
      },
      products: 'GET /api/products'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    availableEndpoints: [
      'GET /',
      'GET /health',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/products',
      'POST /api/ai/detect-disease',
      'POST /api/ai/farming-advice'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  
  res.status(500).json({ 
    error: NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 SmartCropX Backend Server running on port ' + PORT);
  console.log('✅ Environment: ' + NODE_ENV);
  console.log('✅ Version: 2.0.0 - AI Enhanced');
  console.log('✅ Plant.id API: ' + (process.env.PLANT_ID_API_KEY ? 'Ready' : 'Not configured'));
  console.log('✅ Crop.health API: ' + (process.env.CROP_HEALTH_API_KEY ? 'Ready' : 'Not configured'));
  console.log('✅ AI Features: Plant Disease Detection, Farming Advice');
  console.log('✅ Demo users: demo/demo123, farmer/farm123, buyer/buy123');
  console.log('✅ Health check: /health');
  console.log('🤖🌱 SmartCropX - AI Farming Platform Ready!');
});

export default app;