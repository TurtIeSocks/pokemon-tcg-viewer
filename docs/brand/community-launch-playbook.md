# Cardstack Community Launch Playbook

How to stand up the Cardstack collector community. The product is the on-ramp; the community is the moat. This is the plan to make the "Belong" beat real, which is also the gate that unblocks the in-app community UI (Phase 2 of the rebrand).

## Platform: Discord first

**Discord is the home.** Reddit comes later, as a discovery and SEO funnel, not the home.

| | Discord (chosen) | Reddit (later) |
|---|---|---|
| Ownership | You own the space, roles, rules | You don't own it; admins can change the rules |
| Seeding 20-50 founders | Easy, intimate, real-time | Hard, cold public posting |
| Pull-sharing / trades | Native, fast, image-friendly | Slower, thread-based |
| Discovery / SEO | Weak | Strong (this is why it joins later) |

Rationale: a brand-new community needs intimacy and control to survive its first weeks. Discord gives both, and it is where TCG collectors already gather. Once there is steady activity, a subreddit adds public discovery and feeds new members back into the Discord and the app.

## Identity

The community reinforces one identity: **collectors who own their stuff.** Not renters, not speculators chasing a dashboard. People who want their collection to be theirs (their data, their cards) and who enjoy the chase with others who get it. Every ritual, channel, and welcome message should make a member feel more like that person.

## Channel architecture

Keep it small at launch. Empty channels read as a dead community. Start with these, split later only when traffic demands it:

- **#start-here:** read-only. What Cardstack is, the vibe, the rules, how to use the app. One pinned welcome post.
- **#introduce-yourself:** what you collect, your white whale.
- **#show-your-pulls:** the heartbeat. New cards, graded returns, mail days.
- **#trades:** buy/sell/trade, with clear safety norms pinned.
- **#set-help:** "what's the last card I need", deal-hunting, completion advice.
- **#feedback-and-roadmap:** feature requests and bugs for the app. Close the loop publicly when something ships.
- **#off-topic:** the social glue.

## New-member journey

1. **Pinned welcome (#start-here):** what this is, the "collectors who own their stuff" identity, the three things to do first (introduce yourself, post a pull, try the app).
2. **Intro prompt:** a single easy question in #introduce-yourself ("what are you chasing right now?").
3. **First-week nudges:** a real human (you, at first) replies to every intro and first pull by name. This is the social proof you are buying.
4. **App to hub bridge:** the in-app nudges (Phase 2) carry people from a moment in the app into the relevant channel.
   - first card added becomes "Nice pull. Other collectors would want to see that one." linking to #show-your-pulls
   - empty vault / not sure where to start becomes "Ask the collectors. They have opinions about every set." linking to #set-help
   - set completed becomes "Whole set, done. That earns a victory lap." linking to #show-your-pulls
   - landing community section CTA "Join the Stack" links to the server invite

## Founding-member plan (first 50)

Do things that don't scale. This is the phase that decides whether the community lives.

1. **Recruit 20-50 by hand.** DM the most engaged early users, beta testers, and collectors you already know. Make the ask personal: why them, specifically.
2. **Seed the channels.** Before opening the invite widely, post 5-10 messages that model the behavior you want: a pull, a set-help question, a roadmap note.
3. **Reply to everything, by name.** For the first weeks, every post gets a human response. You are manufacturing the feeling of a warm room.
4. **Invest in power users.** The 1% who post most become moderators, get early access, and get direct input on the roadmap.

## Rituals (build the habit)

- **Weekly:** "What'd you pull this week?" thread. Predictable, low-effort, high-engagement.
- **Monthly:** a set-completion challenge or a themed showcase (best vintage, best art, cheapest grail).
- **Periodic:** a roadmap AMA. When community feedback drives a change in the app, announce it and credit the members who raised it. This is the flywheel: feedback in, shipped feature out, loyalty up.

## Health metrics (check weekly)

- **DAU/MAU ratio:** stickiness. 20%+ is healthy.
- **New-member post rate:** % who post within 7 days of joining.
- **Thread reply rate:** % of posts that get at least one reply.
- **% of posts not from staff:** the community is alive when members carry it.

**Warning signs:** most posts are from the team, questions sit unanswered past a day, the same five people are 80% of activity, new members go quiet after their intro.

## The Phase 2 gate

The in-app community surfaces (landing community section, social-proof block, the three hub nudges) ship **only once the Discord invite URL exists and the channels are seeded.** Wire the invite URL through one config/env source so every nudge links consistently. Until then, the landing eyebrow stays `Browse · Collect · Own it` and no community CTA renders. Honest copy means we point people to a room that is actually warm.
