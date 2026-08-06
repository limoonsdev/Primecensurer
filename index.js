require('dotenv').config();
const { Client, GatewayIntentBits, WebhookClient } = require('discord.js');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('Prime Censure V2 is active.');
});

client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Ignore messages from high-ranking users (Administrators or Manage Messages)
    if (message.member && (message.member.permissions.has('Administrator') || message.member.permissions.has('ManageMessages'))) return;
    
    // Ignore empty messages (e.g. just images)
    if (!message.content || message.content.trim() === '') return;

    try {
        // Fetch the last 20 messages for context
        const fetchedMessages = await message.channel.messages.fetch({ limit: 20 });
        const contextMessages = Array.from(fetchedMessages.values())
            .filter(m => m.id !== message.id)
            .reverse()
            .map(m => `${m.author.username}: ${m.content}`)
            .join('\n');

        const userPrompt = `[CONTEXTE DE LA CONVERSATION]\n${contextMessages}\n\n[MESSAGE À ANALYSER]\n${message.author.username}: ${message.content}`;

        // Define a comprehensive and strict system prompt for the AI
        const systemPrompt = `Tu es une IA de modération très stricte, experte en détection de contournement de censure. Ton rôle est de repérer les insultes, grossièretés, discours haineux et harcèlement.

RÈGLES DE CENSURE STRICTES :
Censure le message (OUI) s'il contient :
1. Des insultes directes ou masquées (connard, salope, fdp, tg, ntm, kys).
2. Des répétitions de lettres pour contourner le filtre (ex: slppppp, connnaaard, mmeeerde).
3. Des abréviations, acronymes, verlan ou "slang" injurieux (ex: fdp, f.d.p, f d p).
4. Des tentatives de contournement avec des symboles, chiffres ou polices personnalisées (ex: m*rde, s@lope, 𝕔0𝕟𝕟𝕒𝕣𝕕, 🅕🅓🅟, 𝖈𝖔𝖓𝖓𝖆𝖗𝖉).
5. Des menaces implicites ou explicites, agressivité, intimidation (ex: "je vais te fumer", "je te v...", "je te ddb", "suicide toi").
6. Des termes discriminatoires (racisme, homophobie, sexisme).
7. De la vulgarité excessive ou des propos à caractère sexuel.

Même si le mot est déformé, incomplet, rallongé, écrit avec des polices spéciales (Unicode, mathématiques, Zalgo), ou traduit phonétiquement, si l'intention est injurieuse, tu DOIS le censurer. Transforme mentalement les caractères bizarres en lettres normales avant de juger.

IMPORTANT SUR LE CONTEXTE :
L'utilisateur te fournira le [CONTEXTE DE LA CONVERSATION] suivi du [MESSAGE À ANALYSER].
Ne juge QUE le [MESSAGE À ANALYSER]. Sers-toi du contexte UNIQUEMENT pour comprendre s'il s'agit d'une blague (ex: des amis qui se taquinent amicalement), d'une discussion technique, ou d'une vraie insulte. Cela permet d'éviter les "faux positifs".

ANALYSE ET FORMAT DE RÉPONSE OBLIGATOIRE :
- Commence TOUJOURS par 1 à 3 phrases pour analyser l'intention (en utilisant le contexte si besoin), détecter le contournement et justifier ta décision.
- Termine IMPÉRATIVEMENT par [DECISION: OUI] si le [MESSAGE À ANALYSER] doit être censuré.
- Termine IMPÉRATIVEMENT par [DECISION: NON] s'il est propre ou s'il s'agit d'humour validé par le contexte.`;

        // Use Groq with Llama 3.1 Versatile to check for profanity
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ],
            model: "llama-3.1-70b-versatile",
            temperature: 0,
            max_tokens: 200,
        });

        const response = completion.choices[0]?.message?.content?.trim().toUpperCase();

        if (response && response.includes('[DECISION: OUI]')) {
            // Delete the offending message
            await message.delete();
            console.log(`Deleted message from ${message.author.tag}: ${message.content}`);

            // Find or create a webhook for the channel
            const webhooks = await message.channel.fetchWebhooks();
            let webhook = webhooks.find(wh => wh.token);

            if (!webhook) {
                webhook = await message.channel.createWebhook({
                    name: 'Prime Censure',
                    avatar: client.user.displayAvatarURL(),
                });
            }

            // Send the mock message using the user's name and avatar
            await webhook.send({
                content: "Oops, j'ai envoyé un message qui a été détecté par Prime Censure V2.",
                username: message.author.username,
                avatarURL: message.author.displayAvatarURL({ dynamic: true }),
            });
        }
    } catch (error) {
        console.error("Error processing message or communicating with Groq API:", error);
    }
});

client.login(process.env.DISCORD_TOKEN);
