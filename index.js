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
        // Fetch the last 6 messages for context (reduced to speed up analysis)
        const fetchedMessages = await message.channel.messages.fetch({ limit: 6 });
        const contextMessages = Array.from(fetchedMessages.values())
            .filter(m => m.id !== message.id)
            .reverse()
            .map(m => `${m.author.username}: ${m.content}`)
            .join('\n');

        const userPrompt = `[CONTEXTE DE LA CONVERSATION]\n${contextMessages}\n\n[MESSAGE À ANALYSER]\n${message.author.username}: ${message.content}`;

        // Define a comprehensive and strict system prompt for the AI
        const systemPrompt = `Tu es une IA de modération très stricte, experte en détection de contournement de censure. Ton rôle est de repérer les insultes, grossièretés, discours haineux et harcèlement.

RÈGLES DE CENSURE STRICTES (OUI) :
1. Insultes directes ou masquées (connard, salope, fdp, tg, ntm, kys).
2. Répétitions de lettres pour insulter (ex: slppppp, connnaaard).
3. Abréviations, acronymes ou verlan injurieux (ex: fdp, f.d.p).
4. Contournements avec symboles/chiffres/polices (ex: m*rde, 🅕🅓🅟).
5. Menaces, agressivité (ex: "je vais te fumer", "suicide toi").
6. Termes discriminatoires ou vulgarité sexuelle excessive.

RÈGLES D'EXEMPTION (FAUX POSITIFS -> NON) :
1. NE CENSURE PAS le langage SMS inoffensif, les fautes de frappe ou les abréviations courantes (ex: "arrt" pour "arrête", "sa" pour "ça", "tfk" pour "tu fais quoi", "slt").
2. NE CENSURE PAS les mots tronqués ou mal orthographiés s'ils n'ont AUCUNE intention injurieuse.
3. NE CENSURE PAS les taquineries amicales si le [CONTEXTE] montre clairement que c'est de l'humour entre amis.

ANALYSE ET FORMAT DE RÉPONSE OBLIGATOIRE :
- Commence TOUJOURS par 1 à 2 phrases pour analyser l'intention (vérifie si c'est du SMS inoffensif comme "arrt" ou une vraie insulte).
- Termine IMPÉRATIVEMENT par [DECISION: OUI] si le [MESSAGE À ANALYSER] doit être censuré.
- Termine IMPÉRATIVEMENT par [DECISION: NON] s'il est propre ou inoffensif.`;

        // Use Groq with Llama 3.3 Versatile to check for profanity
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
            model: "llama-3.3-70b-versatile",
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
