const API_URL = "https://en.wikipedia.org/w/api.php";

const COMMON_FOODS = [
    "pizza", "burger", "hot dog", "french fries", "sandwich", "taco",
    "burrito", "quesadilla", "nachos", "spaghetti", "lasagna",
    "macaroni and cheese", "ravioli", "ramen", "fried rice", "pancakes",
    "waffles", "fried chicken", "chicken nuggets", "steak", "meatballs",
    "sushi", "dumplings", "curry", "chili", "soup", "salad", "toast",
    "scrambled eggs", "omelette", "bacon", "pasta", "ice cream", "cake",
    "cookies", "brownie", "donut", "apple pie", "cheesecake", "chocolate",
    "popcorn", "pretzel", "chips", "apple", "banana", "orange", "watermelon",
    "strawberry", "grapes", "carrot", "broccoli", "corn", "potato",
    "peanut butter", "jelly", "ketchup", "mustard", "hot chocolate",
    "coffee", "orange juice", "lemonade"
];

const state = { mode: null, food: null, hints: [], hintIndex: 0, streak: 0, attempts: 0 };
const $ = (selector) => document.querySelector(selector);

function normalizeGuess(value) {
    return value.toLocaleLowerCase().replace(/[^a-z]/g, "");
}

function similarity(first, second) {
    const matrix = Array.from({ length: first.length + 1 }, () => []);
    for (let row = 0; row <= first.length; row += 1) matrix[row][0] = row;
    for (let column = 0; column <= second.length; column += 1) matrix[0][column] = column;
    for (let row = 1; row <= first.length; row += 1) {
        for (let column = 1; column <= second.length; column += 1) {
            matrix[row][column] = first[row - 1] === second[column - 1]
                ? matrix[row - 1][column - 1]
                : Math.min(matrix[row - 1][column], matrix[row][column - 1], matrix[row - 1][column - 1]) + 1;
        }
    }
    return 1 - matrix[first.length][second.length] / Math.max(first.length, second.length);
}

function isCorrectGuess(guess, food) {
    const normalizedGuess = normalizeGuess(guess);
    const normalizedFood = normalizeGuess(food);
    const aliases = {
        macaroniandcheese: ["macandcheese"]
    };
    return Boolean(normalizedGuess && normalizedFood) &&
        (normalizedGuess === normalizedFood ||
            aliases[normalizedFood]?.includes(normalizedGuess) ||
            similarity(normalizedGuess, normalizedFood) >= .8);
}

async function wikipedia(params) {
    const query = new URLSearchParams({ ...params, format: "json", origin: "*" });
    const response = await fetch(`${API_URL}?${query}`);
    if (!response.ok) throw new Error("Wikipedia is being stupid and the request failed.");
    const data = await response.json();
    if (data.error) throw new Error(data.error.info || "Wikipedia returned an error.");
    return data;
}

async function getDescription(food) {
    const data = await wikipedia({
        action: "query", prop: "extracts", titles: food, exintro: "1",
        explaintext: "1", redirects: "1"
    });
    const page = Object.values(data.query.pages)[0];
    if (!page?.extract?.trim()) throw new Error("Wikipedia has no description for this food.");
    return page.extract.trim();
}

async function getWikitext(page) {
    const data = await wikipedia({ action: "parse", page, prop: "wikitext" });
    if (!data.parse?.wikitext?.["*"]) throw new Error("Wikipedia returned no list data.");
    return data.parse.wikitext["*"];
}

function getTopLevelLinks(wikitext) {
    return [...wikitext.matchAll(/^\* +\[\[:?([^|\]#]+)/gm)].map((match) => match[1].trim());
}

async function getHardFood() {
    const preparedFoods = await getWikitext("Lists of prepared foods");
    const listPages = getTopLevelLinks(preparedFoods).filter((title) =>
        title.toLocaleLowerCase().startsWith("list of ")
    );
    if (!listPages.length) throw new Error("Wikipedia returned no prepared food lists.");
    const selectedList = listPages[Math.floor(Math.random() * listPages.length)];
    const pages = getTopLevelLinks(await getWikitext(selectedList))
        .filter((title) => !["food", "dish", "meal", "snack", "beverage", "drink", "cuisine", "recipe"]
            .includes(title.toLocaleLowerCase()))
        .sort(() => Math.random() - .5)
        .slice(0, 20);
    const data = await wikipedia({
        action: "query", prop: "extracts", titles: pages.join("|"),
        exintro: "1", explaintext: "1", redirects: "1"
    });
    const markers = ["food", "dish", "cuisine", "meal", "ingredient", "sauce", "dessert",
        "beverage", "bread", "meat", "seafood", "fish", "fruit", "vegetable", "grain",
        "noodle", "rice", "cake", "drink", "snack", "cheese", "soup", "stew"];
    const nonFood = ["television", "tv series", "film", "movie", "book", "novel", "magazine",
        "album", "song", "video game", "restaurant", "company", "brand", "chain", "chef",
        "cookbook", "program", "show", "festival", "industry", "history", "culture",
        "science", "technology", "policy", "law"];
    const edible = Object.values(data.query.pages).find((page) => {
        const title = page.title.toLocaleLowerCase();
        const description = (page.extract || "").toLocaleLowerCase();
        const introduction = description.split(/(?<=[.!?])\s+/)[0];
        return !title.includes("(disambiguation)") &&
            markers.some((marker) => new RegExp(`\\b${marker}\\b`).test(introduction)) &&
            !nonFood.some((marker) => new RegExp(`\\b${marker}\\b`).test(introduction));
    });
    if (!edible) throw new Error("Wikipedia did not return an edible food.");
    return edible.title;
}

function makeHints(description, food) {
    const sentences = description.split(/(?<=[.!?])\s+/);
    const foodPattern = new RegExp(food.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    const safe = [...new Set(sentences.map((sentence) => sentence.replace(foodPattern, "this food").trim()).filter(
        (sentence) => sentence && sentence.toLocaleLowerCase() !== "this food"
    ))];
    if (safe.length >= 2) return safe.sort(() => Math.random() - .5).slice(0, 2);
    return [
        safe[0] || "The food has a description, but this clue had no hints that wouldn’t give it away. Sorry :(",
        "The food has a description, but this clue had no hints that wouldn’t give it away. Sorry :("
    ];
}

async function startRound() {
    state.attempts = 0;
    state.food = state.mode === "easy"
        ? COMMON_FOODS[Math.floor(Math.random() * COMMON_FOODS.length)]
        : null;
    $("#guess-input").disabled = true;
    $("#skip-button").disabled = true;
    $("#round-status").textContent = "Loading a food…";
    $("#hint").textContent = "Loading a clue from Wikipedia…";
    $("#feedback").textContent = "";
    $("#continue-button").classList.add("hidden");
    $("#new-game-button").classList.add("hidden");
    try {
        if (!state.food) state.food = await getHardFood();
        state.hints = makeHints(await getDescription(state.food), state.food);
        state.hintIndex = 0;
        $("#hint").textContent = state.hints[0];
        $("#round-status").textContent = "Your first guess";
        $("#guess-input").disabled = false;
        $("#skip-button").disabled = false;
        $("#guess-input").focus();
    } catch (error) {
        $("#round-status").textContent = "Could not load this round";
        $("#feedback").textContent = error.message;
        $("#feedback").className = "feedback error";
        $("#skip-button").disabled = false;
    }
}

function finishRound(won) {
    if (won) {
        state.streak += 1;
        $("#feedback").textContent = state.streak > 1
            ? `Ur a smart cookie u got it! ${state.streak} in a row 🔥`
            : "Ur a smart cookie u got it!";
        $("#feedback").className = "feedback";
    } else {
        const lostStreak = state.streak > 1;
        state.streak = 0;
        $("#feedback").textContent = lostStreak
            ? `LMAO U LOST UR STREAK — the food was ${state.food}.`
            : `Nope u stupid — the food was ${state.food}.`;
        $("#feedback").className = "feedback error";
    }
    $("#streak").textContent = state.streak;
    $("#guess-input").disabled = true;
    $("#skip-button").disabled = true;
    $("#continue-button").classList.remove("hidden");
    $("#new-game-button").classList.remove("hidden");
    $("#round-status").textContent = won ? "Round complete" : "Better luck next time";
}

$("#guess-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const guess = $("#guess-input").value.trim();
    $("#guess-input").value = "";
    if (!guess || !state.food) return;
    if (isCorrectGuess(guess, state.food)) {
        finishRound(true);
    } else if (state.attempts === 0) {
        state.attempts = 1;
        state.hintIndex = 1;
        $("#hint").textContent = state.hints[1];
        $("#round-status").textContent = "One more attempt";
        $("#feedback").textContent = "Nope u stupid. You have one more attempt.";
        $("#feedback").className = "feedback error";
        $("#guess-input").focus();
    } else {
        finishRound(false);
    }
});

$("#skip-button").addEventListener("click", () => {
    if (state.food) {
        state.streak = 0;
        $("#streak").textContent = "0";
        startRound();
    }
});

document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        $("#mode-label").textContent = `${state.mode} mode`;
        $("#setup-card").classList.add("hidden");
        $("#game-card").classList.remove("hidden");
        startRound();
    });
});

$("#continue-button").addEventListener("click", startRound);

$("#new-game-button").addEventListener("click", () => {
    $("#game-card").classList.add("hidden");
    $("#setup-card").classList.remove("hidden");
});
