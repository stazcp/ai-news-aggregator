#!/usr/bin/env node

/**
 * RSS Feed Testing Script
 * Tests all configured RSS feeds without running AI clustering
 * Helps identify problematic feeds before they cause issues in production
 */

const Parser = require('rss-parser')
const fs = require('fs')
const path = require('path')

// Load RSS feeds configuration
const rssConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'src/lib/rss-feeds.json'), 'utf8')
)

// Browser configurations for spoofing
const BROWSER_CONFIGS = [
  {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  },
]

// Function to get simple, reliable browser headers
function getSimpleBrowserHeaders() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    Connection: 'keep-alive',
  }
}

// Test a single RSS feed
async function testFeed(url, sourceName, feedId, category) {
  const headers = getSimpleBrowserHeaders()

  const parser = new Parser({
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
    },
    customFields: {
      item: [
        ['media:content', 'media:content'],
        ['media:thumbnail', 'media:thumbnail'],
        ['media:group', 'media:group'],
        ['image', 'image'],
      ],
    },
  })

  try {
    const feed = await parser.parseURL(url)

    const itemCount = feed.items ? feed.items.length : 0
    const status = itemCount > 0 ? '✅' : '⚠️'
    const statusText = itemCount > 0 ? 'SUCCESS' : 'EMPTY'

    console.log(`${status} ${sourceName} (${feedId}) - ${statusText} - ${itemCount} items`)

    return {
      url,
      sourceName,
      feedId,
      category,
      status: statusText,
      itemCount,
      error: null,
    }
  } catch (error) {
    let errorType = 'UNKNOWN'
    let errorMessage = error.message

    if (error.message.includes('Status code 403')) {
      errorType = 'BLOCKED'
      errorMessage = 'Access forbidden (likely bot detection)'
    } else if (error.message.includes('Status code 404')) {
      errorType = 'NOT_FOUND'
      errorMessage = 'Feed URL not found'
    } else if (error.message.includes('Non-whitespace before first tag')) {
      errorType = 'MALFORMED_XML'
      errorMessage = 'Invalid XML (likely HTML error page)'
    } else if (error.message.includes('timeout') || error.message.includes('ENOTFOUND')) {
      errorType = 'NETWORK_ERROR'
      errorMessage = 'Network timeout or DNS resolution failed'
    }

    console.log(`❌ ${sourceName} (${feedId}) - ${errorType} - ${errorMessage}`)

    return {
      url,
      sourceName,
      feedId,
      category,
      status: errorType,
      itemCount: 0,
      error: errorMessage,
    }
  }
}

// Main testing function
async function testAllFeeds() {
  console.log('🧪 RSS Feed Testing Script')
  console.log('='.repeat(50))
  console.log()

  const results = []
  const sources = rssConfig.sources

  let totalFeeds = 0
  for (const source of Object.values(sources)) {
    totalFeeds += source.feeds.length
  }

  console.log(`Testing ${totalFeeds} feeds from ${Object.keys(sources).length} sources...\n`)

  for (const [sourceKey, source] of Object.entries(sources)) {
    console.log(`📂 Testing ${source.name}:`)

    for (const feed of source.feeds) {
      const result = await testFeed(feed.url, source.name, feed.id, feed.category)
      results.push(result)

      // Small delay to be respectful to servers
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    console.log() // Empty line between sources
  }

  // Generate summary report
  console.log('📊 SUMMARY REPORT')
  console.log('='.repeat(50))

  const successful = results.filter((r) => r.status === 'SUCCESS')
  const empty = results.filter((r) => r.status === 'EMPTY')
  const blocked = results.filter((r) => r.status === 'BLOCKED')
  const notFound = results.filter((r) => r.status === 'NOT_FOUND')
  const malformed = results.filter((r) => r.status === 'MALFORMED_XML')
  const networkErrors = results.filter((r) => r.status === 'NETWORK_ERROR')
  const otherErrors = results.filter(
    (r) =>
      !['SUCCESS', 'EMPTY', 'BLOCKED', 'NOT_FOUND', 'MALFORMED_XML', 'NETWORK_ERROR'].includes(
        r.status
      )
  )

  console.log(
    `✅ Successful feeds: ${successful.length} (${((successful.length / results.length) * 100).toFixed(1)}%)`
  )
  console.log(`⚠️  Empty feeds: ${empty.length}`)
  console.log(`🚫 Blocked feeds: ${blocked.length}`)
  console.log(`❓ Not found (404): ${notFound.length}`)
  console.log(`🔧 Malformed XML: ${malformed.length}`)
  console.log(`🌐 Network errors: ${networkErrors.length}`)
  console.log(`❌ Other errors: ${otherErrors.length}`)

  console.log(`\nTotal articles found: ${successful.reduce((sum, r) => sum + r.itemCount, 0)}`)

  // List problematic feeds
  const problematic = results.filter((r) => r.status !== 'SUCCESS')
  if (problematic.length > 0) {
    console.log('\n🔍 PROBLEMATIC FEEDS:')
    console.log('-'.repeat(50))

    problematic.forEach((result) => {
      console.log(`❌ ${result.sourceName} (${result.feedId})`)
      console.log(`   URL: ${result.url}`)
      console.log(`   Issue: ${result.error || result.status}`)
      console.log()
    })

    console.log('💡 RECOMMENDATIONS:')
    if (blocked.length > 0) {
      console.log(
        `• ${blocked.length} feeds are blocked - consider finding alternative RSS URLs for these sources`
      )
    }
    if (malformed.length > 0) {
      console.log(
        `• ${malformed.length} feeds return invalid XML - these may be serving HTML error pages`
      )
    }
    if (notFound.length > 0) {
      console.log(`• ${notFound.length} feeds return 404 - these URLs may have changed`)
    }
  }

  // Save detailed results to file
  const reportPath = path.join(__dirname, 'feed-test-results.json')
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        summary: {
          total: results.length,
          successful: successful.length,
          empty: empty.length,
          blocked: blocked.length,
          notFound: notFound.length,
          malformed: malformed.length,
          networkErrors: networkErrors.length,
          otherErrors: otherErrors.length,
        },
        results,
      },
      null,
      2
    )
  )

  console.log(`\n📄 Detailed results saved to: ${reportPath}`)

  return results
}

// Run the test if this script is executed directly
if (require.main === module) {
  testAllFeeds().catch(console.error)
}

module.exports = { testAllFeeds, testFeed }
