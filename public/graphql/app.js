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
    reviewed {
      titleEN
      ratingText
      review
    }
  }
}`,
  anilistQuery: `query {
  anilistQuery(titles: ["Death Note", "Erased", "Jujutsu Kaisen"])
}`,
  recommend: `query {
  recommend(anilistResponse: """
PASTE ANILIST'S WHOLE RESULT HERE
""") {
    liked { input found title }
    picks {
      score
      sharedGenres
      sharedTags
      review { titleEN seasonName ratingText }
    }
    hiddenGem {
      popularity
      sharedGenres
      review { titleEN seasonName ratingText }
    }
  }
}`,
  exploreFields: `query {
  __type(name: "Season") {
    fields {
      name
      description
      type {
        name
        kind
        ofType { name kind }
      }
    }
  }
}`,
};

const dom = {
  examplePicker: document.getElementById('examplePicker'),
  queryInput: document.getElementById('queryInput'),
  runQuery: document.getElementById('runQuery'),
  result: document.getElementById('result'),
  anilistStep: document.getElementById('anilistStep'),
  copyAnilistQuery: document.getElementById('copyAnilistQuery'),
  copyStatus: document.getElementById('copyStatus'),
};

/** The AniList query from the last anilistQuery result, ready to copy; '' when there isn't one. */
let anilistQueryText = '';

dom.examplePicker.addEventListener('change', () => {
  dom.queryInput.value = EXAMPLES[dom.examplePicker.value] ?? '';
});

dom.runQuery.addEventListener('click', runQuery);

async function runQuery() {
  const query = dom.queryInput.value.trim();
  if (!query) return;

  dom.runQuery.disabled = true;
  dom.result.textContent = 'Loading...';
  showAnilistStep(null);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const body = await response.json();
    dom.result.textContent = JSON.stringify(body, null, 2);
    showAnilistStep(body?.data?.anilistQuery);
  } catch (err) {
    dom.result.textContent = `Request failed: ${err.message}`;
  } finally {
    dom.runQuery.disabled = false;
  }
}

/**
 * Recommendations step 1 answers with an AniList query as a JSON string, whose
 * quotes come out escaped in the result above - so it gets a copy button that
 * copies the query itself.
 * @param {unknown} query
 */
function showAnilistStep(query) {
  anilistQueryText = typeof query === 'string' ? query : '';
  if (dom.anilistStep) dom.anilistStep.hidden = !anilistQueryText;
  if (dom.copyStatus) dom.copyStatus.textContent = '';
}

dom.copyAnilistQuery?.addEventListener('click', async () => {
  if (!anilistQueryText) return;
  try {
    await navigator.clipboard.writeText(anilistQueryText);
    dom.copyStatus.textContent = 'Copied.';
  } catch {
    // No clipboard access (an insecure context, or permission denied): put
    // the query in the editor, selected, to copy by hand.
    dom.queryInput.value = anilistQueryText;
    dom.queryInput.select();
    dom.copyStatus.textContent = 'Couldn\'t copy - it\'s in the editor above, selected.';
  }
});

dom.queryInput.value = EXAMPLES.current;
