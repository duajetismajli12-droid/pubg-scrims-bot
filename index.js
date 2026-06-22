// Importimi i konfigurimeve
const config = require('./config.js');

// Tani mund t'i përdorësh kudo në kod kështu:
console.log(config.ALLOWED_TEAMS); // Shembull: printon listën e ekipeve

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

let adminUsername = 'Admin'; // Emri default nëse dështon gjetja

client.once('clientReady', async () => {
    console.log(`[PUBG SCRIMS] Bot u lidh me sukses! Optimizuar për 25+ ekipe.`);
    
    // Gjejmë emrin e adminit automatikisht nga ID-ja e .env
    try {
        const adminUser = await client.users.fetch(ADMIN_ID);
        adminUsername = adminUser.username;
        console.log(`[OWO INTEGRATION] Komandat do të gjenerohen për: owo give ${adminUsername}`);
    } catch (error) {
        console.log(`[⚠️ ERROR] Nuk u gjet asnjë përdorues me ID-në e vendosur në .env`);
    }
});

client.on('messageCreate', async message => {
    // --- INTEGRIMI I BOT-IT OWO (ZGJIDHJA PËRFUNDIMTARE) ---
    if (message.author.id === OWO_BOT_ID) {
        const owoMessageText = message.content || (message.embeds[0] ? (message.embeds[0].description || message.embeds[0].title) : '');
        
        // 1. Kapim mesazhin e parë ku kërkohet konfirmimi
        if (owoMessageText.includes('will give') && owoMessageText.includes('cowoncy') && owoMessageText.includes('To confirm')) {
            
            // Nxjerrim të dhënat menjëherë sa janë të qarta
            const amountMatch = owoMessageText.match(/([\d,]+)\s+cowoncy/i);
            const senderMatch = owoMessageText.match(/<@!?(\d+)>\s+will give/);
            
            if (amountMatch && senderMatch && owoMessageText.includes(ADMIN_ID)) {
                const amountCleaned = parseInt(amountMatch[1].replace(/,/g, ''));
                const senderId = senderMatch[1];
                
                console.log(`[OWO PENDING] Transaksion në pritje: ${amountCleaned} OwO nga ${senderId}. Po pritet klikimi...`);

                // Krijojmë një funksion dëgjues që qëndron specifikisht mbi këtë mesazh
                const checkUpdate = async (oldMessage, newMessage) => {
                    if (newMessage.id !== message.id) return;
                    
                    const updatedText = newMessage.content || (newMessage.embeds[0] ? (newMessage.embeds[0].description || newMessage.embeds[0].title) : '');
                    
                    // Nëse teksti ndryshoi dhe NUK përmban më udhëzimin për konfirmim, do të thotë që u shtyp butoni me sukses!
                    if (!updatedText.includes('To confirm this transaction')) {
                        
                        // Kontrollojmë nëse përdoruesi ka një bast në pritje për këtë shumë
                        const pending = pendingBets.get(senderId);
                        if (pending && pending.amount === amountCleaned) {
                            const match = matchPredictions.get(pending.matchId);
                            
                            if (match && match.status === 'open') {
                                if (!match.bets[pending.team]) match.bets[pending.team] = [];

                                match.bets[pending.team].push({ userId: senderId, amount: pending.amount });
                                match.totalPool += pending.amount;
                                
                                pendingBets.delete(senderId);
                                
                                // Heqim dëgjuesin që të mos harxhojë memorie
                                client.off('messageUpdate', checkUpdate);

                                const successEmbed = new EmbedBuilder()
                                    .setDescription(`✅ **Bast i Konfirmuar plotësisht!** Bot-i OwO verifikoi transferimin e **${pending.amount} OwO** nga <@${senderId}> për ekipin **${pending.team.toUpperCase()}**!`)
                                    .setColor('#2ecc71');
                                
                                message.channel.send({ embeds: [successEmbed] });
                                console.log(`[OWO SUCCESS] Basti i lojtarit ${senderId} u konfirmua pas klikimit!`);
                            }
                        }
                    }
                };

                // Aktivizojmë përgjimin e ndryshimit të mesazhit
                client.on('messageUpdate', checkUpdate);

                // Nëse lojtari nuk e klikon për 1 minutë, hiqet përgjuesi automatikisht
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
    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

    // 1. KRIJIMI I NDESHJES (Tani nuk ka nevojë për emrat e ekipeve)
    // Përdorimi: !create_prediction <MatchID> <MinBet> <MaxBet>
    if (command === 'create_prediction' && isAdmin) {
        const [matchId, minBet, maxBet] = args;
        if (!maxBet) return message.reply("Përdorimi: `!create_prediction <MatchID> <MinBet> <MaxBet>`\nShembull: `!create_prediction Match1 100 5000`");

        matchPredictions.set(matchId, { 
            status: 'open', 
            minBet: parseInt(minBet), 
            maxBet: parseInt(maxBet), 
            bets: {}, // Struktura do të mbushet vetë: { "navi": [...], "faze": [...] }
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
        if (channel) channel.send({ embeds: [embed] });
        message.reply(`Parashikimi për lobby-n ${matchId} u hap me sukses.`);
    }

    // 2. VENDOSJA E BASTIT
if (command === 'bet') {
    // 1. Marrim të dhënat nga komanda
    const [matchId, amountStr, ...teamArgs] = args;
    const amount = parseInt(amountStr);
    const teamName = teamArgs.join(' ').toLowerCase(); 

    // 2. Kontrollojmë nëse ekipi është në listën e lejuar (nga config.js)
    if (!config.ALLOWED_TEAMS.includes(teamName)) {
        return message.reply(`❌ Ky ekip nuk është në listën tonë. Ekipet e lejuara: ${config.ALLOWED_TEAMS.join(', ').toUpperCase()}`);
    }

    // 3. Kontrollojmë ndeshjen
    const match = matchPredictions.get(matchId);
    if (!match || match.status !== 'open') return message.reply("🚫 Kjo ndeshje nuk ekziston ose bastet janë mbyllur.");
    
    // 4. Kontrollojmë shumën
    if (isNaN(amount) || amount < match.minBet || amount > match.maxBet) {
        return message.reply(`🚫 Basti duhet të jetë midis ${match.minBet} dhe ${match.maxBet} OwO.`);
    }

    // 5. Ruajmë bastin në pritje
    pendingBets.set(message.author.id, { matchId, amount, team: teamName, timestamp: Date.now() });


    // Gjej këtë pjesë në kodin tënd dhe zëvendësoje:
const adminUser = client.users.cache.get(config.ADMIN_ID);
const adminName = adminUser ? adminUser.username : "Admin";

// Ndryshoje pjesën ku shkruhet komanda e OwO-së:
message.reply({
    content: `⏳ **Bast në pritje!** Për të konfirmuar votën tuaj për **${teamName.toUpperCase()}**, dërgoni paratë tek **@f2_goatt**.\n\n` +
             `👉 Kopjo këtë komandë dhe dërgoje:\n` +
             `\`owo give @f2_goatt ${amount}\``
});

    // Ruajmë bastin dhe ID-në e timer-it
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
    timer: timeout // Ruajmë timer-in këtu
});
}

if (command === 'anulo') {
    console.log("Duke kërkuar bast për ID:", message.author.id); // Kjo do të shfaqet në terminalin tënd
    
    const bet = pendingBets.get(message.author.id);
    if (!bet) {
        console.log("Nuk u gjet asnjë bast për këtë përdorues.");
        return message.reply("🚫 Ju nuk keni asnjë bast në pritje për të anuluar.");
    }

    // Ndalojmë timer-in
    if (bet.timer) {
        clearTimeout(bet.timer);
    }
    
    // Fshijmë bastin
    pendingBets.delete(message.author.id);
    
    console.log("Basti u anulua me sukses për:", message.author.id);
    message.reply("✅ Basti juaj u anulua me sukses.");
}

    // 3. SHPALLJA E FITUESIT NGA 25 EKIPET
    if (command === 'set_winner' && isAdmin) {
        const [matchId, ...teamArgs] = args;
        const winningTeam = teamArgs.join(' ').toLowerCase();
        const match = matchPredictions.get(matchId);

        if (!match) return message.reply("Ndeshja nuk u gjet.");
        if (!winningTeam) return message.reply("Shkruani emrin e ekipit fitues.");
        
        match.status = 'closed';

        // Kontrollojmë nëse ka pasur baste për këtë ekip specifik
        const winningBetsList = match.bets[winningTeam] || [];
        const totalWinningBets = winningBetsList.reduce((sum, bet) => sum + bet.amount, 0);
        
        let payoutLog = '';

        if (totalWinningBets > 0) {
            winningBetsList.forEach(bet => {
                // Formula proporcionale: merr pjesën e vet nga e gjithë pishina (nga të 25 ekipet)
                const payout = Math.floor((bet.amount / totalWinningBets) * match.totalPool);
                const currentWinnings = userEconomy.get(bet.userId) || 0;
                userEconomy.set(bet.userId, currentWinnings + payout);
                payoutLog += `<@${bet.userId}> fitoi **${payout} OwO**\n`;
            });
        } else {
            payoutLog = `Asnjë lojtar nuk kishte vendosur bast për ekipin **${winningTeam.toUpperCase()}**. Të gjitha monedhat e pishinës (${match.totalPool} OwO) shkojnë për thesarit të serverit!`;
        }

        const resultEmbed = new EmbedBuilder()
            .setTitle(`📊 Rezultatet e PUBG Scrims: ${matchId}`)
            .setDescription(`**WWCD (Fituesi):** 🏆 **${winningTeam.toUpperCase()}**\n\n**Totali i Monedhave në lojë:** ${match.totalPool} OwO\n\n**Shpërndarja e fituesve:**\n${payoutLog}`)
            .setColor('#2ecc71');

        const resultsChannel = message.guild.channels.cache.find(c => c.name.includes('prediction-results'));
        if (resultsChannel) resultsChannel.send({ embeds: [resultEmbed] });
        
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