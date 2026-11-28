//! LeetCode's public (unofficial) GraphQL endpoint — same queries as src/lib/leetcode.ts.
//! Only the problem slug is sent. Statement HTML is returned raw; the frontend sanitizes it
//! with the web app's sanitize.ts before saving.

use std::time::Duration;

use serde_json::{json, Value};

/// "https://leetcode.com/problems/min-stack/description/" → "min-stack"
pub fn slug(url: &str) -> Option<String> {
    let url = url.trim();
    let lower = url.to_ascii_lowercase();
    let rest = lower.strip_prefix("https://").or_else(|| lower.strip_prefix("http://"))?;
    let rest = rest.strip_prefix("www.").unwrap_or(rest);
    let rest = rest.strip_prefix("leetcode.com/problems/").or_else(|| rest.strip_prefix("leetcode.cn/problems/"))?;
    let s: String = rest.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '-').collect();
    (!s.is_empty()).then_some(s)
}

async fn query(slug: &str, fields: &str) -> Result<Option<Value>, ()> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(10)).build().map_err(|_| ())?;
    let res = client
        .post("https://leetcode.com/graphql")
        .header("Referer", format!("https://leetcode.com/problems/{slug}/"))
        .header("User-Agent", "Mozilla/5.0 (compatible; DSA-Log)")
        .json(&json!({
            "query": format!("query q($titleSlug: String!) {{ question(titleSlug: $titleSlug) {{ {fields} }} }}"),
            "variables": { "titleSlug": slug },
        }))
        .send()
        .await
        .map_err(|_| ())?;
    if !res.status().is_success() {
        return Err(());
    }
    let body: Value = res.json().await.map_err(|_| ())?;
    Ok(body.pointer("/data/question").filter(|q| !q.is_null()).cloned())
}

pub enum Content {
    Ok { html: String },
    Err { reason: &'static str },
}

impl Content {
    /// Same shape as the web app's FetchResult (before sanitizing).
    pub fn to_json(&self) -> Value {
        match self {
            Content::Ok { html } => json!({ "ok": true, "html": html }),
            Content::Err { reason } => json!({ "ok": false, "reason": reason }),
        }
    }
}

/// Raw statement HTML (unsanitized).
pub async fn content(url: &str) -> Content {
    let Some(slug) = slug(url) else { return Content::Err { reason: "not-leetcode" } };
    match query(&slug, "isPaidOnly content").await {
        Err(()) => Content::Err { reason: "network" },
        Ok(None) => Content::Err { reason: "not-found" },
        Ok(Some(q)) => match q["content"].as_str().filter(|s| !s.is_empty()) {
            Some(html) => Content::Ok { html: html.to_string() },
            None => Content::Err { reason: if q["isPaidOnly"].as_bool() == Some(true) { "premium" } else { "not-found" } },
        },
    }
}

pub struct Meta {
    pub number: Option<i64>,
    pub title: String,
    pub difficulty: &'static str,
    pub premium: bool,
}

pub async fn meta(slug: &str) -> Result<Meta, &'static str> {
    match query(slug, "questionFrontendId title difficulty isPaidOnly").await {
        Err(()) => Err("network"),
        Ok(None) => Err("not-found"),
        Ok(Some(q)) => Ok(Meta {
            number: q["questionFrontendId"].as_str().and_then(|s| s.parse().ok()),
            title: q["title"].as_str().unwrap_or_default().to_string(),
            difficulty: match q["difficulty"].as_str() {
                Some("Easy") => "Easy",
                Some("Hard") => "Hard",
                _ => "Medium",
            },
            premium: q["isPaidOnly"].as_bool().unwrap_or(false),
        }),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn slugs() {
        assert_eq!(super::slug("https://leetcode.com/problems/min-stack/description/").as_deref(), Some("min-stack"));
        assert_eq!(super::slug("https://www.leetcode.cn/problems/Two-Sum?x=1").as_deref(), Some("two-sum"));
        assert_eq!(super::slug("https://example.com/problems/two-sum"), None);
    }
}
