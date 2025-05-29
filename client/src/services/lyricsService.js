import { byProxy } from './proxy';

class LyricsService {
  /**
   * Lấy lời bài hát từ lrclib.net API
   * @param {Object} song - Thông tin bài hát
   * @returns {Promise<Object>} - Dữ liệu lời bài hát
   */
  async getLyrics(song) {
    if (!song) return null;

    try {
      // Trích xuất thông tin bài hát
      const artistName = this.extractArtistName(song);
      const trackName = this.extractTrackName(song);
      
      if (!artistName || !trackName) {
        console.log('Không đủ thông tin để tìm lời bài hát');
        return null;
      }

      // Tạo URL với các tham số cần thiết
      const params = new URLSearchParams({
        artist_name: artistName,
        track_name: trackName
      });

      // Không thêm duration để tăng khả năng tìm thấy lời bài hát
      // if (song.duration) {
      //   params.append('duration', Math.floor(song.duration));
      // }

      // Sử dụng proxy để tránh các vấn đề CORS
      const url = `https://lrclib.net/api/get?${params.toString()}`;
      const proxyUrl = byProxy(url);
      
      console.log(`Đang tìm lời bài hát: ${artistName} - ${trackName}`);
      
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`Lỗi API: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Nếu không có dữ liệu, trả về null
      if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
        console.log('Không tìm thấy lời bài hát');
        return null;
      }
      
      return this.processLyrics(data);
    } catch (error) {
      console.error('Lỗi khi lấy lời bài hát:', error);
      return null;
    }
  }
  
  /**
   * Trích xuất tên nghệ sĩ từ thông tin bài hát
   */
  extractArtistName(song) {
    // Thử các trường khác nhau theo thứ tự ưu tiên
    let artist = song.artist || 
           song.artistName || 
           song.channel || 
           song.channelName ||
           song.author ||
           'Unknown Artist';
    
    // Loại bỏ " - Topic" từ tên nghệ sĩ để tăng khả năng tìm kiếm thành công
    artist = artist.replace(/\s+-\s+Topic$/, '');
    
    return artist;
  }
  
  /**
   * Trích xuất tên bài hát từ thông tin bài hát
   */
  extractTrackName(song) {
    // Thử các trường khác nhau theo thứ tự ưu tiên
    let title = song.title?.text || song.title || song.name || '';
    
    // Loại bỏ các thông tin thừa thường có trong tên video YouTube
    title = title
      .replace(/\(Official Video\)/i, '')
      .replace(/\(Official Audio\)/i, '')
      .replace(/\(Official Music Video\)/i, '')
      .replace(/\(Lyrics\)/i, '')
      .replace(/\(Lyric Video\)/i, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/Official Video/i, '')
      .replace(/Official Audio/i, '')
      .replace(/Official Music Video/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
      
    return title;
  }
  
  /**
   * Xử lý dữ liệu lời bài hát thành định dạng chuẩn
   */
  processLyrics(data) {
    // Sử dụng lời đã đồng bộ nếu có, nếu không, sử dụng lời thường
    if (data.syncedLyrics) {
      return {
        id: data.id,
        artist: data.artistName,
        title: data.trackName,
        album: data.albumName,
        duration: data.duration,
        lines: this.parseSyncedLyrics(data.syncedLyrics),
        plainText: data.plainLyrics,
        synced: true
      };
    } else if (data.plainLyrics) {
      return {
        id: data.id,
        artist: data.artistName,
        title: data.trackName,
        album: data.albumName,
        duration: data.duration,
        lines: this.parsePlainLyrics(data.plainLyrics),
        plainText: data.plainLyrics,
        synced: false
      };
    }
    
    return null;
  }
  
  /**
   * Phân tích lời bài hát đã đồng bộ thành mảng các dòng có thời gian
   */
  parseSyncedLyrics(syncedLyrics) {
    if (!syncedLyrics) return [];
    
    return syncedLyrics
      .split('\n')
      .map(line => {
        // Định dạng: [mm:ss.xx] text
        const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\](.*)/);
        if (match) {
          const minutes = parseInt(match[1], 10);
          const seconds = parseInt(match[2], 10);
          const hundredths = parseInt(match[3], 10);
          const text = match[4].trim();
          
          // Tính tổng thời gian bằng giây
          const time = minutes * 60 + seconds + hundredths / 100;
          
          return { time, text };
        }
        
        // Nếu không đúng định dạng, trả về dòng không có thời gian
        return { time: 0, text: line.trim() };
      })
      .filter(line => line.text); // Lọc bỏ các dòng trống
  }
  
  /**
   * Phân tích lời bài hát thường thành mảng các dòng
   * Phân bổ thời gian đều cho các dòng
   */
  parsePlainLyrics(plainLyrics) {
    if (!plainLyrics) return [];
    
    const lines = plainLyrics
      .split('\n')
      .filter(line => line.trim());
    
    // Phân bổ thời gian đều cho các dòng
    // Giả sử bài hát dài 3 phút (180 giây)
    const estimatedDuration = 180;
    const timePerLine = estimatedDuration / lines.length;
    
    return lines.map((text, index) => ({
      time: index * timePerLine,
      text: text.trim()
    }));
  }
}

export default new LyricsService();
