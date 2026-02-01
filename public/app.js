// State
let articles = [];
let filteredArticles = [];

// Category colors for UI
const categoryColors = {
  "Hardware Integrations": { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" },
  "Hardware Comparisons": { bg: "bg-indigo-100", text: "text-indigo-800", border: "border-indigo-200" },
  "Software Comparisons": { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-200" },
  "Platform Guides": { bg: "bg-pink-100", text: "text-pink-800", border: "border-pink-200" },
  "Industry Guides": { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-200" },
  "Skills & Techniques": { bg: "bg-green-100", text: "text-green-800", border: "border-green-200" },
  "Script Writing": { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-200" },
  "Production & Setup": { bg: "bg-red-100", text: "text-red-800", border: "border-red-200" }
};

const priorityColors = {
  "High": { bg: "bg-red-100", text: "text-red-800" },
  "Medium": { bg: "bg-yellow-100", text: "text-yellow-800" },
  "Low": { bg: "bg-green-100", text: "text-green-800" }
};

const statusColors = {
  "planned": { bg: "bg-gray-100", text: "text-gray-800" },
  "in_progress": { bg: "bg-blue-100", text: "text-blue-800" },
  "written": { bg: "bg-yellow-100", text: "text-yellow-800" },
  "published": { bg: "bg-green-100", text: "text-green-800" }
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadArticles();
  populateCategoryFilter();
  updateStats();
  render();
  
  // Event listeners
  document.getElementById('search').addEventListener('input', applyFilters);
  document.getElementById('category-filter').addEventListener('change', applyFilters);
  document.getElementById('priority-filter').addEventListener('change', applyFilters);
  document.getElementById('funnel-filter').addEventListener('change', applyFilters);
  document.getElementById('status-filter').addEventListener('change', applyFilters);
  document.getElementById('view-mode').addEventListener('change', render);
});

async function loadArticles() {
  try {
    const response = await fetch('/api/articles', { credentials: 'same-origin' });
    const data = await response.json();
    if (data.length === 0) {
      // Seed from static data if empty
      await seedArticles();
      const response2 = await fetch('/api/articles');
      articles = await response2.json();
    } else {
      articles = data;
    }
    filteredArticles = [...articles];
  } catch (err) {
    console.error('Failed to load articles:', err);
    // Fallback to static data
    if (typeof staticArticles !== 'undefined') {
      articles = staticArticles;
      filteredArticles = [...articles];
    }
  }
}

async function seedArticles() {
  if (typeof staticArticles === 'undefined') return;
  try {
    await fetch('/api/articles/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: staticArticles })
    });
  } catch (err) {
    console.error('Failed to seed articles:', err);
  }
}

function populateCategoryFilter() {
  const categories = [...new Set(articles.map(a => a.category))].sort();
  const select = document.getElementById('category-filter');
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });
}

async function updateStats() {
  try {
    const response = await fetch('/api/stats', { credentials: 'same-origin' });
    const stats = await response.json();
    document.getElementById('total-count').textContent = stats.total;
    document.getElementById('high-count').textContent = stats.high_priority;
    document.getElementById('medium-count').textContent = stats.medium_priority;
    document.getElementById('low-count').textContent = stats.low_priority;
  } catch (err) {
    const high = articles.filter(a => a.priority === 'High').length;
    const medium = articles.filter(a => a.priority === 'Medium').length;
    const low = articles.filter(a => a.priority === 'Low').length;
    document.getElementById('total-count').textContent = articles.length;
    document.getElementById('high-count').textContent = high;
    document.getElementById('medium-count').textContent = medium;
    document.getElementById('low-count').textContent = low;
  }
}

function applyFilters() {
  const search = document.getElementById('search').value.toLowerCase();
  const category = document.getElementById('category-filter').value;
  const priority = document.getElementById('priority-filter').value;
  const funnel = document.getElementById('funnel-filter').value;
  const status = document.getElementById('status-filter').value;
  
  filteredArticles = articles.filter(article => {
    const matchesSearch = !search || 
      article.title.toLowerCase().includes(search) ||
      (article.keyword && article.keyword.toLowerCase().includes(search)) ||
      (article.description && article.description.toLowerCase().includes(search));
    const matchesCategory = !category || article.category === category;
    const matchesPriority = !priority || article.priority === priority;
    const matchesFunnel = !funnel || article.funnel === funnel;
    const matchesStatus = !status || article.status === status;
    
    return matchesSearch && matchesCategory && matchesPriority && matchesFunnel && matchesStatus;
  });
  
  render();
}

async function updateArticleStatus(id, status) {
  try {
    await fetch(`/api/articles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    await loadArticles();
    applyFilters();
    updateStats();
  } catch (err) {
    console.error('Failed to update article:', err);
  }
}

function render() {
  const viewMode = document.getElementById('view-mode').value;
  const contentArea = document.getElementById('content-area');
  
  document.getElementById('results-count').textContent = filteredArticles.length;
  
  switch(viewMode) {
    case 'calendar':
      renderCalendarView(contentArea);
      break;
    case 'category':
      renderCategoryView(contentArea);
      break;
    default:
      renderListView(contentArea);
  }
}

function renderListView(container) {
  const html = filteredArticles.map(article => `
    <div class="bg-white rounded-lg shadow-sm p-4 mb-3 border-l-4 ${categoryColors[article.category]?.border || 'border-gray-200'}">
      <div class="flex justify-between items-start gap-4">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="text-xs font-mono text-gray-400">${article.article_id || article.id}</span>
            <span class="text-xs px-2 py-0.5 rounded ${categoryColors[article.category]?.bg} ${categoryColors[article.category]?.text}">${article.category}</span>
            <span class="text-xs px-2 py-0.5 rounded ${priorityColors[article.priority]?.bg} ${priorityColors[article.priority]?.text}">${article.priority}</span>
            <span class="text-xs px-2 py-0.5 rounded ${statusColors[article.status]?.bg || 'bg-gray-100'} ${statusColors[article.status]?.text || 'text-gray-800'}">${article.status || 'planned'}</span>
            <span class="text-xs text-gray-500">Week ${article.week}</span>
          </div>
          <h3 class="font-semibold text-gray-900 mb-1">${article.title}</h3>
          <p class="text-sm text-gray-600 mb-2">${article.description || ''}</p>
          <div class="flex flex-wrap gap-2 text-xs text-gray-500">
            <span class="bg-gray-100 px-2 py-1 rounded">🔍 ${article.keyword || ''}</span>
            <span class="bg-gray-100 px-2 py-1 rounded">📊 ${article.intent || ''}</span>
            <span class="bg-gray-100 px-2 py-1 rounded">🎯 ${article.funnel || ''}</span>
            <span class="bg-gray-100 px-2 py-1 rounded">📝 ${(article.word_count || article.wordCount || 0).toLocaleString()} words</span>
          </div>
        </div>
        <div class="flex-shrink-0">
          <select onchange="updateArticleStatus(${article.id}, this.value)" class="text-xs border rounded px-2 py-1">
            <option value="planned" ${article.status === 'planned' ? 'selected' : ''}>Planned</option>
            <option value="in_progress" ${article.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
            <option value="written" ${article.status === 'written' ? 'selected' : ''}>Written</option>
            <option value="published" ${article.status === 'published' ? 'selected' : ''}>Published</option>
          </select>
        </div>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html || '<p class="text-gray-500 text-center py-8">No articles match your filters</p>';
}

function renderCalendarView(container) {
  const weeks = {};
  filteredArticles.forEach(article => {
    if (!weeks[article.week]) weeks[article.week] = [];
    weeks[article.week].push(article);
  });
  
  const sortedWeeks = Object.keys(weeks).sort((a, b) => parseInt(a) - parseInt(b));
  
  const html = `
    <div class="grid gap-4">
      ${sortedWeeks.map(week => {
        const quarter = Math.ceil(parseInt(week) / 13);
        return `
          <div class="bg-white rounded-lg shadow-sm p-4">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-lg font-bold text-indigo-600">Week ${week}</span>
              <span class="text-sm text-gray-500">Q${quarter}</span>
            </div>
            <div class="grid md:grid-cols-2 gap-3">
              ${weeks[week].map(article => `
                <div class="border rounded-lg p-3 ${categoryColors[article.category]?.border || 'border-gray-200'}">
                  <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <span class="text-xs font-mono text-gray-400">${article.article_id || article.id}</span>
                    <span class="text-xs px-2 py-0.5 rounded ${priorityColors[article.priority]?.bg} ${priorityColors[article.priority]?.text}">${article.priority}</span>
                    <span class="text-xs px-2 py-0.5 rounded ${statusColors[article.status]?.bg || 'bg-gray-100'} ${statusColors[article.status]?.text || 'text-gray-800'}">${article.status || 'planned'}</span>
                  </div>
                  <h4 class="font-medium text-sm text-gray-900">${article.title}</h4>
                  <span class="text-xs ${categoryColors[article.category]?.text}">${article.category}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  
  container.innerHTML = html || '<p class="text-gray-500 text-center py-8">No articles match your filters</p>';
}

function renderCategoryView(container) {
  const categories = {};
  filteredArticles.forEach(article => {
    if (!categories[article.category]) categories[article.category] = [];
    categories[article.category].push(article);
  });
  
  const sortedCategories = Object.keys(categories).sort();
  
  const html = sortedCategories.map(category => `
    <div class="mb-8">
      <div class="flex items-center gap-2 mb-4">
        <h2 class="text-xl font-bold text-gray-900">${category}</h2>
        <span class="text-sm px-2 py-1 rounded ${categoryColors[category]?.bg} ${categoryColors[category]?.text}">
          ${categories[category].length} articles
        </span>
      </div>
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${categories[category].map(article => `
          <div class="bg-white rounded-lg shadow-sm p-4 border-t-4 ${categoryColors[article.category]?.border || 'border-gray-200'}">
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              <span class="text-xs font-mono text-gray-400">${article.article_id || article.id}</span>
              <span class="text-xs px-2 py-0.5 rounded ${priorityColors[article.priority]?.bg} ${priorityColors[article.priority]?.text}">${article.priority}</span>
              <span class="text-xs px-2 py-0.5 rounded ${statusColors[article.status]?.bg || 'bg-gray-100'} ${statusColors[article.status]?.text || 'text-gray-800'}">${article.status || 'planned'}</span>
              <span class="text-xs text-gray-500">Wk ${article.week}</span>
            </div>
            <h3 class="font-medium text-gray-900 mb-1 text-sm">${article.title}</h3>
            <p class="text-xs text-gray-500">${article.keyword || ''}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html || '<p class="text-gray-500 text-center py-8">No articles match your filters</p>';
}
