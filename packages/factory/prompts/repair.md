Your app failed the gate. Fix it with the smallest change that makes this failure go away. Do not rewrite parts that work.

Stage: {{STAGE}}
Rule: {{RULE}}
Message: {{MESSAGE}}
{{LINE}}
{{TRACE}}
{{DETAIL}}

What this rule means and the usual fix:
{{HINT}}

The app that failed:

```tsx
{{SOURCE}}
```

Think in this order:
1. Which line or rule causes this failure?
2. Is the code wrong, or is an invariant too strict for a state that is actually fine? Fix the one that is wrong. Never delete an invariant only to pass; replace it with a true one that is just as strong.
3. Make that one fix. Check it does not break another rule (guards, purity, copy).

Reply with the whole fixed module in one ```tsx block and nothing else.
