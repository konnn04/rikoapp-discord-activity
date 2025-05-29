class Participant {
  constructor(id, name, avatarUrl = null) {
    this.id = id;
    this.name = name;
    this.avatarUrl = avatarUrl;
    this.joinedAt = Date.now();
  }
}

export default Participant;