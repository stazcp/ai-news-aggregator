# AI News Aggregator

An intelligent news aggregation platform that uses AI to cluster, summarize, and present news articles from multiple RSS feeds. The app automatically groups related articles about the same events and provides AI-generated summaries for each story cluster.

## 🚀 Features

- **AI-Powered Clustering**: Groups related articles about the same events using advanced TF-IDF and LLM techniques
- **Smart Summaries**: Generates concise AI summaries for each story cluster
- **Multi-Source Aggregation**: Fetches news from 50+ RSS feeds across various categories
- **Real-time Updates**: Caches data for performance while keeping content fresh
- **Topic Filtering**: Filter news by trending topics and categories
- **Responsive Design**: Modern, mobile-friendly interface built with Next.js and Tailwind CSS

## 🏗️ How It Works

### 1. **News Collection**

The app fetches articles from multiple RSS feeds organized by category:

- **Politics**: CNN Politics, BBC Politics, Reuters Politics, etc.
- **Technology**: TechCrunch, Ars Technica, The Verge, etc.
- **Business**: Bloomberg, Financial Times, Wall Street Journal, etc.
- **World News**: BBC World, Reuters World, AP News, etc.
- **Sports**: ESPN, BBC Sport, Sky Sports, etc.

### 2. **AI Clustering Pipeline**

The core intelligence lies in a sophisticated multi-stage clustering system:

#### **Stage 1: Pre-clustering (TF-IDF + Cosine Similarity)**

- Converts article text (title, description, content) into numerical vectors using TF-IDF
- Groups articles with high semantic similarity using cosine similarity
- Uses configurable thresholds (default: 0.42 similarity, min 2 articles per cluster)
- Provides fast, deterministic initial clustering

#### **Stage 2: LLM Refinement**

- Sends pre-clustered groups to Groq's LLM for intelligent refinement
- LLM names clusters and adjusts article membership
- Handles nuanced language understanding and semantic relationships
- Processes large clusters in overlapping chunks to manage token limits

#### **Stage 3: Post-processing Optimization**

- **Overlap Merging**: Combines clusters with shared articles using Jaccard similarity
- **Title Merging**: Merges clusters with similar titles
- **Coherence Splitting**: Breaks up overly broad clusters into tighter groups
- **LLM Merging**: Handles paraphrases and cross-language duplicates
- **Expansion**: Finds additional related articles for existing clusters

### 3. **Content Enhancement**

- **AI Summaries**: Generates concise summaries for each story cluster
- **Image Collages**: Creates visual collages from article images
- **Severity Scoring**: Ranks stories by importance and impact
- **Trending Topics**: Identifies and highlights trending topics

### 4. **Performance Optimization**

- **Intelligent Caching**: Multi-layer caching system for fast loading
- **Rate Limit Handling**: Graceful degradation when AI services hit limits
- **Error Recovery**: Robust error handling with fallback mechanisms
- **Background Processing**: Non-blocking data fetching and processing

## 🛠️ Technical Architecture

### **Frontend**

- **Next.js 15** with App Router
- **React 19** with TypeScript
- **Tailwind CSS** for styling
- **TanStack Query** for data fetching
- **Radix UI** components

### **Backend Services**

- **RSS Parser** for news collection
- **Groq AI** for LLM-powered clustering and summarization
- **Custom TF-IDF** implementation for text similarity
- **Redis-compatible caching** for performance

### **Key Algorithms**

- **TF-IDF Vectorization**: Converts text to numerical representations
- **Cosine Similarity**: Measures semantic similarity between articles
- **Jaccard Similarity**: Handles set-based comparisons for merging
- **Centroid-based Clustering**: Groups articles around cluster centers

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd ai-news-aggregator
```

2. **Install dependencies**

```bash
pnpm install
# or
npm install
```

3. **Set up environment variables**
   Create a `.env.local` file:

```bash
# Required: Groq API key for AI clustering and summarization
GROQ_API_KEY=your_groq_api_key_here

# Optional: Clustering configuration
PRECLUSTER_THRESHOLD=0.42          # Similarity threshold for pre-clustering
PRECLUSTER_MIN_SIZE=2              # Minimum articles per cluster
PRECLUSTER_MAX_GROUP=40            # Maximum articles per cluster
CLUSTER_JACCARD_MERGE=0.45         # Jaccard threshold for merging
CLUSTER_TITLE_MERGE=0.72           # Title similarity threshold
CLUSTER_COHERENCE_THRESHOLD=0.52   # Coherence splitting threshold
CLUSTER_LLM_MERGE=true             # Enable LLM-based merging
CLUSTER_EXPAND=true                # Enable cluster expansion

# Optional: Severity scoring
SEVERITY_USE_LLM=true              # Use LLM for severity assessment
SEVERITY_BOOST_WAR=10              # Boost for war/conflict stories
SEVERITY_BOOST_DEATHS=7            # Boost for casualty stories
SEVERITY_BOOST_POLITICS=3          # Boost for political stories
SEVERITY_BOOST_ECONOMY=2           # Boost for economic stories
SEVERITY_BOOST_TECH=1              # Boost for tech stories

# Optional: Performance tuning
CLUSTER_DIAGNOSTICS=true           # Enable clustering diagnostics
```

4. **Run the development server**

```bash
pnpm dev
# or
npm run dev
```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📊 Configuration

The app is highly configurable through environment variables:

### **Clustering Parameters**

- `PRECLUSTER_THRESHOLD`: Similarity threshold for initial clustering (0.0-1.0)
- `PRECLUSTER_MIN_SIZE`: Minimum articles required to form a cluster
- `PRECLUSTER_MAX_GROUP`: Maximum articles per initial cluster
- `CLUSTER_JACCARD_MERGE`: Threshold for merging overlapping clusters
- `CLUSTER_TITLE_MERGE`: Threshold for merging clusters with similar titles

### **Performance Tuning**

- `CLUSTER_SEED_CHUNK`: Maximum articles per LLM processing chunk
- `CLUSTER_SEED_OVERLAP`: Overlap between chunks for large clusters
- `CLUSTER_UNCOVERED_CHUNK`: Chunk size for processing uncovered articles

### **Content Filtering**

- `CLUSTER_EXPAND_SIM`: Similarity threshold for cluster expansion
- `CLUSTER_EXPAND_MAX_ADD`: Maximum articles to add per cluster
- `CLUSTER_EXPAND_TIME_HOURS`: Time window for cluster expansion

## 🔧 API Endpoints

- `GET /api/news` - Fetch all news articles
- `GET /api/summarize` - Generate AI summary for articles
- `GET /api/clear-cache` - Clear application cache
- `GET /api/resolve-image` - Resolve and normalize image URLs

## 📈 Performance

- **Caching**: Multi-layer caching reduces API calls and improves load times
- **Rate Limiting**: Intelligent handling of AI service rate limits
- **Background Processing**: Non-blocking data fetching and clustering
- **Error Recovery**: Graceful degradation when services are unavailable

## 🚀 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Add your `GROQ_API_KEY` environment variable
3. Deploy automatically on every push

### Other Platforms

The app can be deployed to any platform that supports Next.js:

- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- **Groq** for AI-powered clustering and summarization
- **Next.js** team for the excellent framework
- **RSS feed providers** for making their content available
- **Open source community** for the various libraries used
