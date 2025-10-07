// API Configuration - Will use relative paths for production
const API_BASE_URL = '/api';
const AUTH_BASE_URL = '/api/auth';

// Application State
let currentUser = null;
let myProducts = [];
let allUsers = [];
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let currentChat = null;
let messages = JSON.parse(localStorage.getItem('chatMessages')) || {};
let selectedProductForPurchase = null;
let allProducts = [];
let selectedAvatar = '';
let onlineUsers = new Set();
let authToken = localStorage.getItem('authToken');
let currentTab = 'feed';

// Enhanced Error Handling
class AppError extends Error {
    constructor(message, type = 'error') {
        super(message);
        this.name = 'AppError';
        this.type = type;
        this.timestamp = new Date().toISOString();
    }
}

// Enhanced API Service
const apiService = {
    async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
                ...options.headers,
            },
            ...options,
        };

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Network error' }));
                throw new AppError(errorData.error || `HTTP ${response.status}`, 'api');
            }
            
            return await response.json();
        } catch (error) {
            console.error('API Request failed:', error);
            throw new AppError(error.message || 'Network request failed', 'network');
        }
    },

    async get(endpoint) {
        return this.request(endpoint);
    },

    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }
};

// Authentication Functions
async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showNotification('Please enter both username and password', 'error');
        return;
    }

    showLoading('Signing in...');
    setButtonLoading('loginBtn', true);

    try {
        const data = await apiService.post('/auth/login', { username, password });
        
        authToken = data.token;
        currentUser = data.user;
        
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        await loadAppData();
        showNotification(`Welcome to SmartCropX, ${currentUser.fullName}! 🌱🤖`, 'success');
        
    } catch (error) {
        showNotification(error.message || 'Login failed. Please try again.', 'error');
    } finally {
        hideLoading();
        setButtonLoading('loginBtn', false);
    }
}

async function signup() {
    const fullName = document.getElementById('fullName').value.trim();
    const age = document.getElementById('age').value;
    const region = document.getElementById('region').value.trim();
    const userType = document.querySelector('.user-type-option.selected')?.dataset.value;
    const username = document.getElementById('signupUsername').value.trim();
    const password = document.getElementById('signupPassword').value;

    if (!fullName || !age || !region || !userType || !username || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    showLoading('Creating your account...');
    setButtonLoading('signupBtn', true);

    try {
        const data = await apiService.post('/auth/register', {
            fullName,
            age: parseInt(age),
            region,
            userType,
            username,
            password,
            avatar: selectedAvatar || '👤'
        });

        authToken = data.token;
        currentUser = data.user;
        
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        await loadAppData();
        showNotification(`Welcome to SmartCropX, ${currentUser.fullName}! 🎉`, 'success');
        
    } catch (error) {
        showNotification(error.message || 'Registration failed. Please try again.', 'error');
    } finally {
        hideLoading();
        setButtonLoading('signupBtn', false);
    }
}

function setButtonLoading(buttonId, isLoading) {
    const button = document.getElementById(buttonId);
    if (button) {
        const btnText = button.querySelector('.btn-text');
        const btnLoading = button.querySelector('.btn-loading');
        
        if (isLoading) {
            btnText.classList.add('hidden');
            btnLoading.classList.remove('hidden');
            button.disabled = true;
        } else {
            btnText.classList.remove('hidden');
            btnLoading.classList.add('hidden');
            button.disabled = false;
        }
    }
}

function selectUserType(element, type) {
    document.querySelectorAll('.user-type-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.removeAttribute('data-value');
    });
    
    element.classList.add('selected');
    element.setAttribute('data-value', type);
}

function showSignup() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('signupForm').classList.remove('hidden');
}

function showLogin() {
    document.getElementById('signupForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        currentUser = null;
        authToken = null;
        cart = [];
        
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('cart');
        
        document.getElementById('appScreen').classList.add('hidden');
        document.getElementById('authScreen').classList.remove('hidden');
        
        showNotification('You have been logged out successfully', 'info');
    }
}

// Loading States
function showLoading(message = 'Loading...') {
    let loader = document.getElementById('globalLoader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'globalLoader';
        loader.className = 'global-loader';
        loader.innerHTML = `
            <div class="loading-overlay">
                <div class="loading-spinner"></div>
                <p class="loading-message">${message}</p>
            </div>
        `;
        document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
}

function hideLoading() {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        loader.style.display = 'none';
    }
}

// Notification System
function showNotification(message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, duration);

    return notification;
}

function getNotificationIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// App Initialization
async function loadAppData() {
    showLoading('Loading SmartCropX...');
    
    try {
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
        }

        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('appScreen').classList.remove('hidden');
        
        await loadDemoData();
        await loadProducts();
        await loadUsers();
        updateProfile();
        loadMyProducts();
        setupProfileButtons();
        addSearchFeature();
        updateHeaderWithCart();
        updateCartBadge();
        
        initializeRealtimeMessaging();
        
    } catch (error) {
        showNotification('Failed to load app data', 'error');
        console.error('App load error:', error);
    } finally {
        hideLoading();
    }
}

// Demo Data
async function loadDemoData() {
    allUsers = [
        {
            id: 'user_1',
            fullName: 'Juan Dela Cruz',
            region: 'Benguet',
            age: 35,
            userType: 'seller',
            avatar: '👨‍🌾'
        },
        {
            id: 'user_2',
            fullName: 'Maria Santos',
            region: 'Guimaras',
            age: 28,
            userType: 'seller',
            avatar: '👩‍🌾'
        }
    ];
    
    allProducts = [
        {
            id: 'prod_1',
            title: 'Fresh Organic Tomatoes',
            description: 'Freshly harvested organic tomatoes from local farm in Benguet',
            pricePerKg: 120.50,
            stock: 50,
            category: 'vegetables',
            seller: allUsers[0],
            rating: 4.5,
            reviewCount: 24
        },
        {
            id: 'prod_2',
            title: 'Sweet Carabao Mangoes',
            description: 'Premium Carabao mangoes from Guimaras',
            pricePerKg: 180.75,
            stock: 30,
            category: 'fruits',
            seller: allUsers[1],
            rating: 4.8,
            reviewCount: 36
        }
    ];
}

async function loadProducts() {
    try {
        const data = await apiService.get('/products');
        allProducts = data.products || data;
        displayProducts(allProducts);
    } catch (error) {
        console.error('Failed to load products:', error);
        displayProducts(allProducts);
    }
}

async function loadUsers() {
    try {
        const data = await apiService.get('/users');
        allUsers = data;
    } catch (error) {
        console.error('Failed to load users:', error);
    }
}

function displayProducts(products) {
    const feed = document.querySelector('.feed');
    if (!feed) return;

    if (products.length === 0) {
        feed.innerHTML = `
            <div class="no-products">
                <i class="fas fa-search" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>No products found</p>
                <small>Try adjusting your search filters</small>
            </div>
        `;
        return;
    }

    feed.innerHTML = products.map(product => `
        <div class="post" onclick="showProductDetails('${product.id}')">
            <div class="post-header">
                <div class="user-avatar">
                    ${product.seller.avatar || '👤'}
                </div>
                <div class="user-info">
                    <h3>${product.seller.fullName}</h3>
                    <p>${product.seller.region}</p>
                </div>
            </div>
            <div class="post-image">
                <i class="fas fa-${getProductIcon(product.category)}"></i>
            </div>
            <div class="post-details">
                <h3 class="product-title">${product.title}</h3>
                <p class="product-description">${product.description}</p>
                <div class="product-price">₱${product.pricePerKg.toFixed(2)}/kg</div>
                <div class="post-actions">
                    <button class="btn btn-buy" onclick="event.stopPropagation(); addToCart('${product.id}')">
                        Add to Cart
                    </button>
                    <button class="btn btn-offer" onclick="event.stopPropagation(); messageSeller('${product.seller.id}')">
                        Message
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function getProductIcon(category) {
    const icons = {
        vegetables: 'carrot',
        fruits: 'apple-alt',
        grains: 'wheat',
        dairy: 'cheese',
        other: 'shopping-basket'
    };
    return icons[category] || 'shopping-basket';
}

// AI Helper Functions
function loadAIHelperTab() {
    const aiHelperTab = document.getElementById('aiHelperTab');
    if (!aiHelperTab) return;
    
    aiHelperTab.innerHTML = `
        <div class="ai-helper-container">
            <div class="ai-header">
                <h3>🤖 SmartCropX AI Assistant</h3>
                <p>Free AI-powered farming advice and pest detection</p>
            </div>
            
            <div class="ai-features">
                <div class="ai-feature-card" onclick="openImageScanner()">
                    <div class="feature-icon">
                        <i class="fas fa-camera"></i>
                    </div>
                    <div class="feature-info">
                        <h4>Scan Crop Health</h4>
                        <p>Upload plant photo for disease detection</p>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                </div>
                
                <div class="ai-feature-card" onclick="askAIQuestion('How to identify common plant diseases?')">
                    <div class="feature-icon">
                        <i class="fas fa-bug"></i>
                    </div>
                    <div class="feature-info">
                        <h4>Pest Detection</h4>
                        <p>Identify and treat plant pests</p>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
            
            <!-- Image Upload Section -->
            <div class="image-upload-section" id="imageUploadSection" style="display: none;">
                <div class="upload-area" onclick="document.getElementById('plantImage').click()">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>Click to upload plant photo</p>
                    <small>Take clear photo of leaves, stems, or fruits</small>
                </div>
                <input type="file" id="plantImage" accept="image/*" style="display: none;" onchange="analyzePlantImage(this.files[0])">
                <div class="image-preview" id="imagePreview"></div>
            </div>
            
            <div class="ai-chat-container">
                <div class="ai-messages" id="aiMessages">
                    <div class="ai-message bot">
                        <div class="message-content">
                            <strong>🌱 Free SmartCropX AI Assistant</strong><br><br>
                            I can help you with:
                            <ul>
                                <li>📸 <strong>Plant Disease Detection</strong> - Upload plant photos</li>
                                <li>🐛 <strong>Pest Identification</strong> - Identify common pests</li>
                                <li>💡 <strong>Farming Advice</strong> - Best practices for Philippine crops</li>
                                <li>🌾 <strong>Crop Management</strong> - Soil, water, and nutrient tips</li>
                            </ul>
                            How can I assist your farming today?
                        </div>
                    </div>
                </div>
                
                <div class="quick-questions">
                    <div class="quick-question" onclick="openImageScanner()">
                        <i class="fas fa-camera"></i> Scan Plant
                    </div>
                    <div class="quick-question" onclick="askAIQuestion('Common rice diseases and treatment')">
                        Rice Diseases
                    </div>
                    <div class="quick-question" onclick="askAIQuestion('Organic pest control methods')">
                        Pest Control
                    </div>
                    <div class="quick-question" onclick="askAIQuestion('Best fertilizer for vegetables')">
                        Fertilizer Tips
                    </div>
                </div>
                
                <div class="ai-input-container">
                    <input type="text" id="aiInput" placeholder="Ask about farming, pests, or plant care...">
                    <button onclick="sendAIQuestion()">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function openImageScanner() {
    document.getElementById('imageUploadSection').style.display = 'block';
}

// Plant Image Analysis
async function analyzePlantImage(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Image = e.target.result;
        
        document.getElementById('imagePreview').innerHTML = `
            <img src="${base64Image}" alt="Plant preview">
            <div class="loading-analysis">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Analyzing plant health...</p>
            </div>
        `;
        
        try {
            const response = await fetch('/api/ai/detect-disease', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    imageBase64: base64Image
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('imagePreview').innerHTML = `
                    <img src="${base64Image}" alt="Plant analysis">
                    <div class="analysis-positive">
                        <h4>🌱 ${result.plantName}</h4>
                        <p>Confidence: ${result.confidence}</p>
                        <p><strong>Health:</strong> ${result.healthAssessment}</p>
                        <p><strong>Treatment:</strong> ${result.treatment}</p>
                    </div>
                `;
            } else {
                document.getElementById('imagePreview').innerHTML = `
                    <img src="${base64Image}" alt="Plant analysis">
                    <div class="analysis-warning">
                        <p>${result.message}</p>
                        <small>Try taking a clearer photo of the leaves or affected area.</small>
                    </div>
                `;
            }
            
        } catch (error) {
            document.getElementById('imagePreview').innerHTML = `
                <div class="analysis-warning">
                    <p>Analysis failed. Please try again.</p>
                </div>
            `;
        }
    };
    reader.readAsDataURL(file);
}

// AI Question Handler
async function sendAIQuestion() {
    const input = document.getElementById('aiInput');
    const question = input.value.trim();
    
    if (!question) return;
    
    const aiMessages = document.getElementById('aiMessages');
    
    // Add user question
    aiMessages.innerHTML += `
        <div class="ai-message user">
            <div class="message-content">${question}</div>
        </div>
    `;
    
    input.value = '';
    
    // Show typing indicator
    aiMessages.innerHTML += `
        <div class="ai-message bot typing">
            <div class="message-content">
                <i class="fas fa-robot"></i> Consulting farming experts...
            </div>
        </div>
    `;
    
    scrollAIToBottom();
    
    try {
        const response = await fetch('/api/ai/farming-advice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                question: question,
                context: {
                    region: currentUser?.region || 'Philippines',
                    userType: currentUser?.userType || 'farmer'
                }
            })
        });
        
        const data = await response.json();
        
        // Remove typing indicator
        const typingIndicator = aiMessages.querySelector('.typing');
        if (typingIndicator) {
            typingIndicator.remove();
        }
        
        aiMessages.innerHTML += `
            <div class="ai-message bot">
                <div class="message-content">${formatAIResponse(data.response)}</div>
                <div class="ai-source">🌱 SmartCropX Free AI</div>
            </div>
        `;
        
    } catch (error) {
        // Fallback to local knowledge
        generateAIResponse(question);
    }
    
    scrollAIToBottom();
}

function askAIQuestion(question) {
    document.getElementById('aiInput').value = question;
    sendAIQuestion();
}

function formatAIResponse(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function scrollAIToBottom() {
    const aiMessages = document.getElementById('aiMessages');
    if (aiMessages) {
        aiMessages.scrollTop = aiMessages.scrollHeight;
    }
}

function generateAIResponse(question) {
    const aiMessages = document.getElementById('aiMessages');
    const typingIndicator = aiMessages.querySelector('.typing');
    if (typingIndicator) {
        typingIndicator.remove();
    }
    
    const response = getSmartFarmingResponse(question);
    
    aiMessages.innerHTML += `
        <div class="ai-message bot">
            <div class="message-content">${formatAIResponse(response)}</div>
            <div class="ai-source">🌱 SmartCropX Knowledge Base</div>
        </div>
    `;
    
    scrollAIToBottom();
}

function getSmartFarmingResponse(question) {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('tomato')) {
        return `🍅 **Tomato Growing Tips:**\n\nPlant in well-drained soil, provide support with stakes, water consistently, and watch for common pests like aphids and tomato hornworms.`;
    }
    
    if (lowerQuestion.includes('rice')) {
        return `🌾 **Rice Farming Guide:**\n\nEnsure proper water management, use certified seeds, control weeds, and monitor for common diseases like blast and bacterial leaf blight.`;
    }
    
    return `🌱 **Farming Advice:**\n\nI understand you need help with farming. For specific advice, consider consulting local agricultural experts or your extension office.`;
}

// Tab Management
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.nav-item').forEach(navItem => {
        navItem.classList.remove('active');
    });
    
    document.querySelector(`.tab[onclick="switchTab('${tabName}')"]`)?.classList.add('active');
    document.querySelector(`.nav-item[onclick="switchTab('${tabName}')"]`)?.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    document.getElementById(`${tabName}Tab`)?.classList.remove('hidden');
    
    currentTab = tabName;
    
    switch(tabName) {
        case 'feed':
            displayProducts(allProducts);
            break;
        case 'aiHelper':
            loadAIHelperTab();
            break;
        case 'profile':
            updateProfile();
            break;
    }
}

// Profile Management
function updateProfile() {
    if (!currentUser) return;
    
    const mainProfileAvatar = document.getElementById('mainProfileAvatar');
    const mainProfileName = document.getElementById('mainProfileName');
    const mainProfileDetails = document.getElementById('mainProfileDetails');
    const mainProfileType = document.getElementById('mainProfileType');
    
    if (mainProfileAvatar) mainProfileAvatar.textContent = currentUser.avatar || '👤';
    if (mainProfileName) mainProfileName.textContent = currentUser.fullName;
    if (mainProfileDetails) mainProfileDetails.textContent = `${currentUser.region} • ${currentUser.age} years old`;
    if (mainProfileType) mainProfileType.textContent = currentUser.userType.charAt(0).toUpperCase() + currentUser.userType.slice(1);
}

function loadMyProducts() {
    const myProductsGrid = document.querySelector('.my-products-grid');
    if (!myProductsGrid) return;
    
    const userProducts = allProducts.filter(product => 
        product.seller.id === currentUser?.id
    );
    
    if (userProducts.length === 0) {
        myProductsGrid.innerHTML = `
            <div class="no-products">
                <i class="fas fa-seedling" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>No products yet</p>
                <small>Add your first product to start selling</small>
            </div>
        `;
        return;
    }
    
    myProductsGrid.innerHTML = userProducts.map(product => `
        <div class="product-card">
            <div class="product-card-image">
                <i class="fas fa-${getProductIcon(product.category)}"></i>
            </div>
            <div class="product-card-info">
                <div class="product-card-name">${product.title}</div>
                <div class="product-card-price">₱${product.pricePerKg.toFixed(2)}/kg</div>
                <div class="product-card-stock">Stock: ${product.stock} kg</div>
            </div>
        </div>
    `).join('');
}

function setupProfileButtons() {
    // Setup profile-related event listeners
}

function showAddProductForm() {
    showNotification('Product feature coming soon!', 'info');
}

function showEditProfileForm() {
    showNotification('Profile editing coming soon!', 'info');
}

function showChangePasswordForm() {
    showNotification('Password change feature coming soon!', 'info');
}

// Cart Management
function addToCart(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.product.id === productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            product: product,
            quantity: 1
        });
    }
    
    updateCartStorage();
    updateCartBadge();
    showNotification(`${product.title} added to cart`, 'success');
}

function updateCartStorage() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function updateCartBadge() {
    const cartBadge = document.querySelector('.cart-badge');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    if (cartBadge) {
        if (totalItems > 0) {
            cartBadge.textContent = totalItems;
            cartBadge.style.display = 'flex';
        } else {
            cartBadge.style.display = 'none';
        }
    }
}

function showCart() {
    showNotification('Cart feature coming soon!', 'info');
}

function updateHeaderWithCart() {
    updateCartBadge();
}

// Search and Filter
function addSearchFeature() {
    const searchInput = document.getElementById('productSearch');
    const categoryFilter = document.getElementById('categoryFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', debounce(filterProducts, 300));
    }
    
    if (categoryFilter) {
        categoryFilter.addEventListener('change', filterProducts);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function filterProducts() {
    const searchTerm = document.getElementById('productSearch').value.toLowerCase();
    const category = document.getElementById('categoryFilter').value;
    
    let filteredProducts = allProducts;
    
    if (searchTerm) {
        filteredProducts = filteredProducts.filter(product =>
            product.title.toLowerCase().includes(searchTerm) ||
            product.description.toLowerCase().includes(searchTerm)
        );
    }
    
    if (category) {
        filteredProducts = filteredProducts.filter(product => product.category === category);
    }
    
    displayProducts(filteredProducts);
}

// Real-time Messaging (Simplified)
function initializeRealtimeMessaging() {
    // Basic real-time features
    setInterval(() => {
        updateOnlineUsers();
        updateUnreadCounts();
    }, 5000);
}

function updateOnlineUsers() {
    // Simulate online users
    const onlineUserIds = allUsers
        .filter(user => user.id !== currentUser?.id)
        .slice(0, 2)
        .map(user => user.id);
    
    onlineUsers = new Set(onlineUserIds);
}

function updateUnreadCounts() {
    const unreadCount = Object.keys(messages).reduce((count, userId) => {
        return count + messages[userId].filter(msg => 
            msg.sender !== currentUser?.id && !msg.read
        ).length;
    }, 0);
    
    const notificationBadge = document.querySelector('.notification-badge');
    if (notificationBadge) {
        if (unreadCount > 0) {
            notificationBadge.textContent = unreadCount;
            notificationBadge.style.display = 'flex';
        } else {
            notificationBadge.style.display = 'none';
        }
    }
}

function showNotifications() {
    showNotification('No new notifications', 'info');
}

function showProductDetails(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    showNotification(`Viewing ${product.title} - Feature coming soon!`, 'info');
}

function messageSeller(sellerId) {
    showNotification('Messaging feature coming soon!', 'info');
}

// App Initialization
document.addEventListener('DOMContentLoaded', function() {
    const savedUser = localStorage.getItem('currentUser');
    const savedToken = localStorage.getItem('authToken');
    
    if (savedUser && savedToken) {
        currentUser = JSON.parse(savedUser);
        authToken = savedToken;
        loadAppData();
    }
    
    // Initialize with feed tab
    switchTab('feed');
});