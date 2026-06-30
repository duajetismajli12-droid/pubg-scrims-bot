const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Boti është online!');
});

app.listen(port, () => {
  console.log(`Serveri për UptimeRobot është ndezur në portin ${port}`);
});

const config = require('./config.js');
console.log(config.ALLOWED_TEAMS);

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const OWO_BOT_ID = '408785106942164992';
const ADMIN_ID = process.env.ADMIN_ID;

const matchPredictions = new Map(); 
const userEconomy = new Map();
const pendingBets = new Map(); 

let adminUsername = 'Admin';

// RREGULLIMI: Ndryshuar nga 'clientReady' në 'ready'
client.once('ready', async () => {
    console.log(`[PUBG SCRIMS] Bot u lidh me sukses! Optimizuar për 25+ ekipe.`);
    
    try {
        const adminUser = await client.users.fetch(ADMIN_ID);
        adminUsername = adminUser.username;
        console.log(`[OWO INTEGRATION] Komandat do të gjenerohen për: owo give ${adminUsername}`);
    } catch (error) {
        console.log(`[⚠️ ERROR] Nuk u gjet asnjë përdorues me ID-në e vendosur në .env`);
    }
});

client.on('messageCreate', async message => {
    if (message.author.id === OWO_BOT_ID) {
        const owoMessageText = message.content || (message.embeds[0] ? (message.embeds[0].description || message.embeds[0].title) : '');
        
        if (owoMessageText.includes('will give') && owoMessageText.includes('cowoncy') && owoMessageText.includes('To confirm')) {
            const amountMatch = owoMessageText.match(/([\d,]+)\s+cowoncy/i);
            const senderMatch = owoMessageText.match(/<@!?(\d+)>\s+will give/);
            
            if (amountMatch && senderMatch && owoMessageText.includes(ADMIN_ID)) {
                const amountCleaned = parseInt(amountMatch[1].replace(/,/g, ''));
                const senderId = senderMatch[1];
                
                console.log(`[OWO PENDING] Transaksion në pritje: ${amountCleaned} OwO nga ${senderId}. Po pritet klikimi...`);

                const checkUpdate = async (oldMessage, newMessage) => {
                    if (newMessage.id !== message.id) return;
                    
                    const updatedText = newMessage.content || (newMessage.embeds[0] ? (newMessage.embeds[0].description || newMessage.embeds[0].title) : '');
                    
                    if (!updatedText.includes('To confirm this transaction')) {
                        const pending = pendingBets.get(senderId);
                        if (pending && pending.amount === amountCleaned) {
                            const match = matchPredictions.get(pending.matchId);
                            
                            if (match && match.status === 'open') {
                                if (!match.bets[pending.team]) match.bets[pending.team] = [];

                                match.bets[pending.team].push({ userId: senderId, amount: pending.amount });
                                match.totalPool += pending.amount;
                                
                                pendingBets.delete(senderId);
                                client.off('messageUpdate', checkUpdate);

                                const successEmbed = new EmbedBuilder()
                                    .setDescription(`✅ **Bast i Konfirmuar plotësisht!** Bot-i OwO verifikoi transferimin e **${pending.amount} OwO** nga <@${senderId}> për ekipin **${pending.team.toUpperCase()}**!`)
                                    .setColor('#2ecc71');
                                
                                message.channel.send({ embeds: [successEmbed] }).catch(err => console.log("Gabim gjatë dërgimit të konfirmimit:", err.message));
                                console.log(`[OWO SUCCESS] Basti i lojtarit ${senderId} u konfirmua pas klikimit!`);
                            }
                        }
                    }
                };

                client.on('messageUpdate', checkUpdate);

                setTimeout(() => {
                    client.off('messageUpdate', checkUpdate);
                }, 60000);
            }
        }
        return;
    }

    if (!message.content.startsWith('!') || message.author.bot) return;
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const isAdmin = message.member?.permissions.has(PermissionsBitField.Flags.Administrator);

    // 1. KRIJIMI I NDESHJES
    if (command === 'create_prediction' && isAdmin) {
        const [matchId, minBet, maxBet] = args;
        if (!maxBet) return message.reply("Përdorimi: `!create_prediction <MatchID> <MinBet> <MaxBet>`\nShembull: `!create_prediction Match1 100 5000`");

        matchPredictions.set(matchId, { 
            status: 'open', 
            minBet: parseInt(minBet), 
            maxBet: parseInt(maxBet), 
            bets: {}, 
            totalPool: 0 
        });

        const embed = new EmbedBuilder()
            .setTitle(`🏆 PUBG Scrims Prediction - LOBBY OPEN`)
            .setDescription(`**Match ID:** \`${matchId}\`\n\nBasti për këtë ndeshje është i hapur! Mund të votoni për cilëndo nga 25 ekipet që po luajnë në lobby.`)
            .addFields(
                { name: '💰 Minimum Bet', value: `${minBet} OwO`, inline: true },
                { name: '💎 Maximum Bet', value: `${maxBet} OwO`, inline: true }
            )
            .setColor('#f39c12')
            .setFooter({ text: 'Voto: !bet <MatchID> <Shuma> <EmriEkipit>' });

        const channel = message.guild.channels.cache.find(c => c.name.includes('match-predictions'));
        if (channel) {
            channel.send({ embeds: [embed] }).catch(err => {
                message.reply(`❌ Gabim: Boti nuk ka leje të shkruajë në kanalin #${channel.name}. Kontrollo lejet e botit!`);
            });
        } else {
            message.reply("⚠️ Nuk u gjet asnjë kanal me emrin `match-predictions`.");
        }
        message.reply(`Parashikimi për lobby-n ${matchId} u hap me sukses.`);
    }

    // 2. VENDOSJA E BASTIT
    if (command === 'bet') {
        const [matchId, amountStr, ...teamArgs] = args;
        const amount = parseInt(amountStr);
        const teamName = teamArgs.join(' ').toLowerCase(); 

        if (!config.ALLOWED_TEAMS.includes(teamName)) {
            return message.reply(`❌ Ky ekip nuk është në listën tonë. Ekipet e lejuara: ${config.ALLOWED_TEAMS.join(', ').toUpperCase()}`);
        }

        const match = matchPredictions.get(matchId);
        if (!match || match.status !== 'open') return message.reply("🚫 Kjo ndeshje nuk ekziston ose bastet janë mbyllur.");
        
        if (isNaN(amount) || amount < match.minBet || amount > match.maxBet) {
            return message.reply(`🚫 Basti duhet të jetë midis ${match.minBet} dhe ${match.maxBet} OwO.`);
        }

        // Rregulluar logjika e timerit këtu që mos të ketë dyfishim të pendingBets
        const timeout = setTimeout(() => {
            if (pendingBets.has(message.author.id)) {
                pendingBets.delete(message.author.id);
                message.channel.send(`❌ Koha mbaroi! Basti i <@${message.author.id}> u anulua.`);
            }
        }, 120000);

        pendingBets.set(message.author.id, { 
            matchId, 
            amount, 
            team: teamName, 
            timestamp: Date.now(),
            timer: timeout 
        });

        message.reply({
            content: `⏳ **Bast në pritje!** Për të konfirmuar votën tuaj për **${teamName.toUpperCase()}**, dërgoni paratë tek **@f2_goatt**.\n\n` +
                     `👉 Kopjo këtë komandë dhe dërgoje:\n` +
                     `\`owo give @f2_goatt ${amount}\``
        });
    }

    if (command === 'anulo') {
        const bet = pendingBets.get(message.author.id);
        if (!bet) {
            return message.reply("🚫 Ju nuk keni asnjë bast në pritje për të anuluar.");
        }

        if (bet.timer) clearTimeout(bet.timer);
        pendingBets.delete(message.author.id);
        message.reply("✅ Basti juaj u anulua me sukses.");
    }

    // 3. SHPALLJA E FITUESIT
    if (command === 'set_winner' && isAdmin) {
        const [matchId, ...teamArgs] = args;
        const winningTeam = teamArgs.join(' ').toLowerCase();
        const match = matchPredictions.get(matchId);

        if (!match) return message.reply("Ndeshja nuk u gjet.");
        if (!winningTeam) return message.reply("Shkruani emrin e ekipit fitues.");
        
        match.status = 'closed';

        const winningBetsList = match.bets[winningTeam] || [];
        const totalWinningBets = winningBetsList.reduce((sum, bet) => sum + bet.amount, 0);
        
        let payoutLog = '';

        if (totalWinningBets > 0) {
            winningBetsList.forEach(bet => {
                const payout = Math.floor((bet.amount / totalWinningBets) * match.totalPool);
                const currentWinnings = userEconomy.get(bet.userId) || 0;
                userEconomy.set(bet.userId, currentWinnings + payout);
                payoutLog += `<@${bet.userId}> fitoi **${payout} OwO**\n`;
            });
        } else {
            payoutLog = `Asnjë lojtar nuk kishte vendosur bast për ekipin **${winningTeam.toUpperCase()}**. Të gjitha monedhat e pishinës (${match.totalPool} OwO) shkojnë për thesarin e serverit!`;
        }

        const resultEmbed = new EmbedBuilder()
            .setTitle(`📊 Rezultatet e PUBG Scrims: ${matchId}`)
            .setDescription(`**WWCD (Fituesi):** 🏆 **${winningTeam.toUpperCase()}**\n\n**Totali i Monedhave në lojë:** ${match.totalPool} OwO\n\n**Shpërndarja e fituesve:**\n${payoutLog}`)
            .setColor('#2ecc71');

        const resultsChannel = message.guild.channels.cache.find(c => c.name.includes('prediction-results'));
        if (resultsChannel) {
            resultsChannel.send({ embeds: [resultEmbed] }).catch(err => {
                message.reply(`❌ Gabim: Boti nuk mund të dërgonte rezultatet në #${resultsChannel.name}. Mungojnë lejet.`);
            });
        }
        
        matchPredictions.delete(matchId);
        message.reply("Rezultatet u shpërndanë për të gjitha ekipet.");
    }

    // 4. LEADERBOARD
    if (command === 'leaderboard') {
        const sortedUsers = [...userEconomy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        let lbText = '';
        sortedUsers.forEach((user, index) => {
            lbText += `**${index + 1}.** <@${user[0]}> - 💰 ${user[1]} OwO\n`;
        });

        const lbEmbed = new EmbedBuilder()
            .setTitle('🏆 Top 10 PUBG Scrims Bettors')
            .setDescription(lbText || "Asnjë fitues deri tani.")
            .setColor('#9b59b6');

        message.channel.send({ embeds: [lbEmbed] });
    }
});

client.login(process.env.BOT_TOKEN);
