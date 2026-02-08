#!/usr/bin/env node

/**
 * RSS Feed Tester
 * Tests all feeds in rss-feeds.json and reports which ones work/fail
 */

const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = 15000;
const CONCURRENCY = 20; // Number of parallel requests

const parser = new Parser({
  timeout: TIMEOUT_MS,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; NewsAggregator/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
});

async function loadFeeds() {
  const feedsPath = path.join(__dirname, 'src/lib/news/rss-feeds.json');
  const data = JSON.parse(fs.readFileSync(feedsPath, 'utf-8'));

  const allFeeds = [];
  for (const [sourceName, source] of Object.entries(data.sources)) {
    for (const feed of source.feeds) {
      allFeeds.push({
        sourceName,
        id: feed.id,
        category: feed.category,
        url: feed.url,
        isAggregator: source.isAggregator || false,
      });
    }
  }
  return allFeeds;
}

async function testFeed(feed) {
  const startTime = Date.now();
  try {
    const result = await parser.parseURL(feed.url);
    const duration = Date.now() - startTime;
    const itemCount = result.items?.length || 0;

    return {
      ...feed,
      success: true,
      itemCount,
      duration,
      title: result.title || 'Unknown',
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      ...feed,
      success: false,
      error: error.message,
      duration,
    };
  }
}

async function runWithConcurrency(items, fn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);

    // Progress indicator
    const done = Math.min(i + concurrency, items.length);
    process.stdout.write(`\rTesting feeds: ${done}/${items.length}`);
  }
  console.log();
  return results;
}

async function main() {
  console.log('Loading RSS feeds...\n');
  const feeds = await loadFeeds();
  console.log(`Found ${feeds.length} feeds to test\n`);

  const results = await runWithConcurrency(feeds, testFeed, CONCURRENCY);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total feeds: ${results.length}`);
  console.log(`Working: ${successful.length} (${((successful.length/results.length)*100).toFixed(1)}%)`);
  console.log(`Failed: ${failed.length} (${((failed.length/results.length)*100).toFixed(1)}%)`);

  // Stats on working feeds
  if (successful.length > 0) {
    const totalItems = successful.reduce((sum, r) => sum + r.itemCount, 0);
    const avgItems = (totalItems / successful.length).toFixed(1);
    const avgDuration = (successful.reduce((sum, r) => sum + r.duration, 0) / successful.length).toFixed(0);
    console.log(`\nWorking feeds stats:`);
    console.log(`  Total articles available: ${totalItems}`);
    console.log(`  Avg items per feed: ${avgItems}`);
    console.log(`  Avg response time: ${avgDuration}ms`);
  }

  // Report failed feeds
  if (failed.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('FAILED FEEDS');
    console.log('='.repeat(80));

    // Group by error type
    const byError = {};
    for (const f of failed) {
      const errorType = f.error.includes('timeout') ? 'Timeout' :
                       f.error.includes('404') ? '404 Not Found' :
                       f.error.includes('403') ? '403 Forbidden' :
                       f.error.includes('ENOTFOUND') ? 'DNS Error' :
                       f.error.includes('ECONNREFUSED') ? 'Connection Refused' :
                       f.error.includes('Status code') ? f.error : 'Other';
      if (!byError[errorType]) byError[errorType] = [];
      byError[errorType].push(f);
    }

    for (const [errorType, feeds] of Object.entries(byError)) {
      console.log(`\n${errorType} (${feeds.length}):`);
      for (const f of feeds) {
        console.log(`  - ${f.sourceName} [${f.id}]: ${f.url}`);
        if (errorType === 'Other') {
          console.log(`    Error: ${f.error}`);
        }
      }
    }
  }

  // Report successful feeds with 0 items (potentially broken)
  const emptyFeeds = successful.filter(r => r.itemCount === 0);
  if (emptyFeeds.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('WARNING: FEEDS WITH 0 ITEMS');
    console.log('='.repeat(80));
    for (const f of emptyFeeds) {
      console.log(`  - ${f.sourceName} [${f.id}]: ${f.url}`);
    }
  }

  // Report slow feeds (>5s)
  const slowFeeds = successful.filter(r => r.duration > 5000);
  if (slowFeeds.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('SLOW FEEDS (>5s)');
    console.log('='.repeat(80));
    slowFeeds.sort((a, b) => b.duration - a.duration);
    for (const f of slowFeeds) {
      console.log(`  - ${f.sourceName} [${f.id}]: ${(f.duration/1000).toFixed(1)}s`);
    }
  }

  // Exit with error code if there are failures
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
