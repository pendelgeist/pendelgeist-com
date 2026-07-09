const ENDPOINT = '/graphql';

const EXAMPLES = {
  current: `query {
  currentSeason {
    name
    reviewed {
      titleEN
      ratingText
      review
    }
  }
}`,
  seasons: `query {
  seasons {
    id
    name
  }
}`,
  bySeason: `query {
  season(id: "spring-2026") {
    name
    pending
    skipped
  }
}`,
};

const dom = {
  examplePicker: document.getElementById('examplePicker'),
  queryInput: document.getElementById('queryInput'),
  runQuery: document.getElementById('runQuery'),
  result: document.getElementById('result'),
};

dom.examplePicker.addEventListener('change', () => {
  dom.queryInput.value = EXAMPLES[dom.examplePicker.value] ?? '';
});

dom.runQuery.addEventListener('click', runQuery);

async function runQuery() {
  const query = dom.queryInput.value.trim();
  if (!query) return;

  dom.runQuery.disabled = true;
  dom.result.textContent = 'Loading...';
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const body = await response.json();
    dom.result.textContent = JSON.stringify(body, null, 2);
  } catch (err) {
    dom.result.textContent = `Request failed: ${err.message}`;
  } finally {
    dom.runQuery.disabled = false;
  }
}

dom.queryInput.value = EXAMPLES.current;
