const { createTicket, addMessageToTicket, closeTicket } = require('../utils/modmail');
const Ticket = require('../schemas/Ticket');
const Config = require('../schemas/Config');
const config = require('../config/config');
const logger = require('../utils/logger');
const moment = require('moment');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;

    const prefix = config.prefix;

    // =========================
    // DM FROM USER
    // =========================
    if (message.channel.isDMBased()) {

      // Command in DM
      if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();

        if (command === 'tickets' || command === 'list') {
          return handleListTicketsCommand(message, client);
        }

        return;
      }

      // If ticket exists → add message
      const added = await addMessageToTicket(message, client, false);
      if (added) return;

      // If not → create new ticket
      return createTicket(message, client);
    }

    // =========================
    // STAFF CHANNEL (modmail-)
    // =========================
    if (message.channel.name?.startsWith('modmail-')) {

      const guildConfig = await Config.findOne({ guildId: message.guild.id });
      if (!guildConfig) return;

      const staffRoleId = guildConfig.staffRoleId;

      if (!message.member.roles.cache.has(staffRoleId)) {
        return; // No permiso → no hace nada
      }

      // ONLY react to commands starting with prefix
      if (!message.content.startsWith(prefix)) return;

      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const command = args.shift()?.toLowerCase();

      // =========================
      // CLOSE COMMAND
      // =========================
      if (command === 'close') {

        const ticket = await Ticket.findOne({
          channelId: message.channel.id,
          closed: false
        });

        if (!ticket) {
          return message.reply('This is not an active ticket.');
        }

        const reason = args.join(' ') || 'No reason provided';

        try {
          await message.reply('Closing ticket...');
          await closeTicket(message.channel, client, message.author, reason);
        } catch (err) {
          logger.error(err);
          message.reply('Error closing ticket.');
        }

        return;
      }

      // =========================
      // REPLY COMMAND (ONLY THIS SENDS MESSAGE)
      // =========================
      if (command === 'reply') {

        const content = args.join(' ');
        if (!content) {
          return message.reply('Please provide a message to send.');
        }

        const ticket = await Ticket.findOne({
          channelId: message.channel.id,
          closed: false
        });

        if (!ticket) {
          return message.reply('This is not an active ticket.');
        }

        try {
          const user = await client.users.fetch(ticket.userId);
          await user.send(content);

          await message.react('✅'); // confirmation reaction
        } catch (error) {
          logger.error('Error sending message:', error);
          await message.reply('Could not send message to user.');
        }

        return;
      }

      // Any other command → ignore
      return;
    }
  }
};

// =========================
// LIST TICKETS COMMAND (DM)
// =========================
async function handleListTicketsCommand(message, client) {
  try {
    const activeTickets = await Ticket.find({
      userId: message.author.id,
      closed: false
    }).sort({ createdAt: -1 });

    if (!activeTickets.length) {
      return message.reply("You don't have any active tickets.");
    }

    let text = `You have ${activeTickets.length} active ticket(s):\n\n`;

    for (const ticket of activeTickets) {
      const guild = client.guilds.cache.get(ticket.guildId);
      const guildName = guild ? guild.name : 'Unknown Server';
      const created = moment(ticket.createdAt).format('MMM D YYYY, h:mm A');

      text += `• **${guildName}**\nCreated: ${created}\n\n`;
    }

    message.reply(text);

  } catch (error) {
    logger.error(error);
    message.reply('Error retrieving tickets.');
  }
}
