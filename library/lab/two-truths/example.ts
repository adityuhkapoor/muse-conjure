export default {
  chat: "the boys chat",
  rounds: [
    {
      about: "Theo",
      lie: 1,
      facts: [
        { claim: "Fell asleep at a Drake concert. Front row.", receipt: "Jonah, Jun 14: “bro was snoring during Hotline Bling”" },
        { claim: "Ran a half marathon last spring", receipt: "Theo, Apr 9: “my knees hurt from walking to the bus”" },
        { claim: "Hasn't paid for Netflix since 2019", receipt: "Dev, Jan 2: “Theo log out of my account”" },
      ],
      guesses: [
        { name: "Jonah", fact: 1 },
        { name: "Priya", fact: 0 },
        { name: "Noa", fact: 1 },
      ],
    },
    {
      about: "Noa",
      lie: 2,
      facts: [
        { claim: "Locked herself out of her car 3 times in one week", receipt: "Noa, Sep 12: “ok who has a coat hanger. again.”" },
        { claim: "Cried during the Ratatouille rewatch", receipt: "Priya: “Noa u good?” Noa: “onions”" },
        { claim: "Is lactose intolerant", receipt: "Noa, every Friday: “large pie, extra cheese”" },
      ],
      guesses: [
        { name: "Theo", fact: 1 },
        { name: "Dev", fact: 2 },
        { name: "Jonah", fact: 2 },
      ],
    },
    {
      about: "Dev",
      lie: 0,
      facts: [
        { claim: "Has never lost to Jonah in FIFA", receipt: "Jonah, Oct 2: “Dev 0, Jonah 5. Screenshot this”" },
        { claim: "Got carded buying a Lunchable", receipt: "Dev, Aug 30: “cashier said ‘nice try little man’”" },
        { claim: "Knows every word of Mamma Mia", receipt: "Priya, Jul 4: “he did the harmonies. All of them.”" },
      ],
      guesses: [
        { name: "Theo", fact: 2 },
        { name: "Noa", fact: 0 },
        { name: "Priya", fact: 1 },
      ],
    },
  ],
} as const;
